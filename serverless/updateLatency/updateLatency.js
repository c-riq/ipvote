const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');
const s3Client = new S3Client();

const dataCenterIDs = [
    'eu-central-1',
    'ap-northeast-1',
    'sa-east-1',
    'us-east-1',
    'us-west-2',
    'ap-south-1',
    'eu-west-1',
    'af-south-1'
];

// Helper function to stream S3 data to string
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

// Helper function to parse CSV line into object
function parseCSVLine(line, headers) {
    const parts = line.split(',');
    // Validate number of columns matches headers
    if (parts.length !== headers.length) {
        throw new Error(`Invalid number of columns. Expected ${headers.length}, got ${parts.length}`);
    }
    const obj = {};
    headers.forEach((header, index) => {
        obj[header] = parts[index] || '';
    });
    return obj;
}

// Helper function to convert object back to CSV line
function objectToCSVLine(obj, headers) {
    return headers.map(header => obj[header]).join(',');
}

async function processTriangulationFiles(triangulationFiles) {
    const roundsMap = new Map();
    
    // Group files by nonce
    const filesByNonce = new Map();
    for (const file of triangulationFiles.Contents) {
        const fileName = path.basename(file.Key);
        const nonce = fileName.split('-')[0];
        if (!filesByNonce.has(nonce)) {
            filesByNonce.set(nonce, []);
        }
        filesByNonce.get(nonce).push(file);
    }

    // Process each round
    for (const [nonce, files] of filesByNonce) {
        const round = {
            regions: new Map()
        };

        // First find master time for this round
        for (const file of files) {
            if (dataCenterIDs.every(id => !file.Key.includes(id))) {
                const data = await s3Client.send(new GetObjectCommand({
                    Bucket: 'ipvotes',
                    Key: file.Key
                }));
                const measurement = JSON.parse(await streamToString(data.Body));
                round.master = measurement;
                break;
            }
        }

        if (!round.master) continue;

        // Process region measurements
        for (const file of files) {
            if (dataCenterIDs.every(id => !file.Key.includes(id))) continue;

            const data = await s3Client.send(new GetObjectCommand({
                Bucket: 'ipvotes',
                Key: file.Key
            }));
            
            const measurement = JSON.parse(await streamToString(data.Body));
            const region = file.Key.split('-unproxied-')[1].replace('.json', '');
            const roundTripTime_master_client_slave = parseFloat(measurement.lambdaStartTimestamp) - parseFloat(round.master.nonceSentTime);
            const roundTripTime_client_master_client = parseFloat(measurement.clientReceivedNonceTimestamp) - parseFloat(round.master.clientStartTimestamp) - 1000;

            const t0_c = parseFloat(round.master.clientStartTimestamp);
            const t1 = parseFloat(round.master.lambdaStartTimestamp);
            const t2 = parseFloat(round.master.nonceSentTime);
            const t3_c = parseFloat(measurement.clientReceivedNonceTimestamp);
            const t4_c = t3_c;
            const t5 = parseFloat(measurement.lambdaStartTimestamp);

            const clockOffset = ((t3_c - t2) + (t4_c - t5)) / 2;
            const clockOffset_master = -((t1 - t0_c) + (t2 - t3_c)) / 2;
            
            const t3 = t3_c - clockOffset_master;
            const t4 = t3;

            const latency_slave = t5 - t4;
            const latency_master = t3 - t2;

            const latency_slave_2 = roundTripTime_master_client_slave - latency_master;
            const latency_master_2 = roundTripTime_client_master_client/2;
            
            round.regions.set(region, {
                latency_slave,
                latency_master,
                latency_slave_2,
                latency_master_2,
                clockOffset_diff: Math.abs(clockOffset - clockOffset_master),
                roundTripTime_master_client_slave,
                roundTripTime_client_master_client
            });
        }

        roundsMap.set(nonce, round);
    }
    
    return roundsMap;
}

exports.handler = async (event) => {
    try {
        // Get all vote files
        const voteFiles = await s3Client.send(new ListObjectsV2Command({
            Bucket: 'ipvotes',
            Prefix: 'votes/poll='
        }));

        let processedVotes = 0;
        let updatedVotes = 0;
        let results = [];

        // Process all files instead of just the first 20
        const filesToProcess = voteFiles.Contents || [];
        if (filesToProcess.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'No files found to process',
                    time: new Date()
                })
            };
        }

        let allResults = [];
        for (const file of filesToProcess) {
            // Get and parse vote file
            const voteData = await s3Client.send(new GetObjectCommand({
                Bucket: 'ipvotes',
                Key: file.Key
            }));
            const content = await streamToString(voteData.Body);
            const lines = content.split('\n');
            const headers = lines[0].split(',');
            let fileUpdated = false;

            // Check if required headers exist
            const requiredHeaders = ['closest_region', 'latency_ms', 'roundtrip_ms'];
            if (!requiredHeaders.every(header => headers.includes(header))) {
                console.log(`Skipping file ${file.Key}: Missing required headers`);
                continue;
            }

            let updatedLines = [lines[0]]; // Keep header

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                let voteData;
                try {
                    voteData = parseCSVLine(line, headers);
                    processedVotes++;
                } catch (error) {
                    console.error(`Skipping malformed line ${i + 1} in ${file.Key}:`, error.message);
                    continue;
                }

                // Skip records older than 3 days
                const _3days = 3 * 24 * 60 * 60 * 1000;
                const currentTime = Date.now();
                const cutoffTime = currentTime - _3days;
                
                if (parseInt(voteData.time) < cutoffTime) {
                    updatedLines.push(line);
                    continue;
                }

                if (voteData.closest_region && voteData.latency_ms && voteData.roundtrip_ms) {
                    updatedLines.push(line);
                    continue;
                }

                try {
                    const triangulationPrefix = `triangulation/${voteData.ip.replace(/:/g, ';')}/`;
                    const triangulationFiles = await s3Client.send(new ListObjectsV2Command({
                        Bucket: 'ipvotes',
                        Prefix: triangulationPrefix
                    }));

                    if (!triangulationFiles.Contents?.length) {
                        updatedLines.push(line);
                        continue;
                    }

                    const rounds = await processTriangulationFiles(triangulationFiles);
                    
                    let bestLatencyRegion = null;
                    let bestLatency = Infinity;
                    let bestLatency2 = Infinity;
                    let bestRoundTripTimeMasterClientSlave = null;

                    const voteTimestamp = parseInt(voteData.time);
                    const maxTimeDiff = 27 * 60 * 60 * 1000; // 27 hours

                    for (const round of rounds.values()) {
                        // Skip measurements that are too far from vote time
                        const measurementTime = parseInt(round.master.clientStartTimestamp);
                        if (Math.abs(measurementTime - voteTimestamp) > maxTimeDiff) {
                            continue;
                        }

                        for (const [region, metrics] of round.regions.entries()) {
                            if (metrics.latency_slave < 0 || metrics.latency_slave_2 < 0 || 
                                metrics.roundTripTime_master_client_slave < 0 || metrics.clockOffset_diff > 50) continue;
                            if (metrics.latency_slave < bestLatency && metrics.latency_slave_2 < bestLatency2) {
                                bestLatency = metrics.latency_slave;
                                bestLatency2 = metrics.latency_slave_2;
                                bestLatencyRegion = region;
                                bestRoundTripTimeMasterClientSlave = metrics.roundTripTime_master_client_slave;
                            }
                        }
                    }

                    if (bestLatencyRegion) {
                        voteData.closest_region = bestLatencyRegion;
                        voteData.latency_ms = bestLatency.toString();
                        voteData.roundtrip_ms = bestRoundTripTimeMasterClientSlave.toString();
                        updatedLines.push(objectToCSVLine(voteData, headers));
                        fileUpdated = true;
                        updatedVotes++;

                        results.push({
                            ip: voteData.ip,
                            region: bestLatencyRegion,
                            latency: bestLatency,
                            roundTripTimeMasterClientSlave: bestRoundTripTimeMasterClientSlave
                        });
                    } else {
                        updatedLines.push(line);
                    }

                } catch (error) {
                    console.error(`Error processing triangulation for IP ${voteData.ip}:`, error);
                    updatedLines.push(line);
                    continue;
                }
            }

            // Save updated file if changes were made
            if (fileUpdated) {
                const fileContent = updatedLines.join('\n');
                const contentWithNewline = fileContent.endsWith('\n') ? fileContent : fileContent + '\n';
                await s3Client.send(new PutObjectCommand({
                    Bucket: 'ipvotes',
                    Key: file.Key,
                    Body: contentWithNewline
                }));
            }

            allResults.push({
                file: file.Key,
                processedVotes,
                updatedVotes,
                results
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Latency adding complete',
                filesProcessed: filesToProcess.length,
                totalProcessedVotes: processedVotes,
                totalUpdatedVotes: updatedVotes,
                results: allResults,
                time: new Date()
            })
        };

    } catch (error) {
        console.error('Error in triangulation processing:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error in triangulation processing',
                error: error.message,
                time: new Date()
            })
        };
    }
}; 