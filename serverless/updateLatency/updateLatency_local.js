const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');

const s3Client = new S3Client();

// Mock S3 data structure for testing
const testData = {
    votes: {
        'test_vote.csv': `time,ip,poll_,vote,country,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,closest_region,latency_ms,roundtrip_ms
1737724469777,2001:920:3812:4a01:68ee:8a75:24a5:d4bc,Test5,yes,undefined,NL,COLT Technology Services Group Limited,,,,,,`
    },
};



const dataCenterIDs = [
    'eu-central-1',
    'ap-northeast-1',
    'sa-east-1',
    'us-east-1',
    'us-west-2',
    'ap-south-1',
    'eu-west-1',
    'af-south-1'
  ]
  

/* master node data
{
  "event": "nonceGeneratedAtMaster",
  "nonce": "dsxv8v2f71m1fv8c5715mqrd2fu1u2nabxjweuoan2st",
  "ip": "2001:920:3812:4a01:68ee:8a75:24a5:d4bc",
  "lambdaStartTimestamp": 1737724482742,
  "awsRegionOfMaster": "us-east-1",
  "nonceSentTime": 1737724483743,
  "clientStartTimestamp": "1737724522708"
}
*/

/* slave node data
{
  "event": "nonceReceivedAtSlave",
  "nonce": "dsxv8v2f71m1fv8c5715mqrd2fu1u2nabxjweuoan2st",
  "ip": "2001:920:3812:4a01:68ee:8a75:24a5:d4bc",
  "lambdaStartTimestamp": 1737724483879,
  "awsRegionOfSlave": "eu-west-1",
  "lambdaDuration": 356,
  "clientReceivedNonceTimestamp": "1737724523889"
}
*/

// Helper function to write results to file
async function writeResults(filename, content) {
    const outputDir = path.join(__dirname, 'test_output');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, filename), content);
}

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
    const roundsMap = new Map(); // Map to store data for each round
    
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
    
    console.log('Found measurement rounds:', Array.from(filesByNonce.keys()));

    // Process each round
    for (const [nonce, files] of filesByNonce) {
        console.log(`\nProcessing round with nonce: ${nonce}`);
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
                console.log('Found master');
                break;
            }
        }

        if (!round.master) {
            console.log('No master found for round, skipping...');
            continue;
        }

        // Process region measurements
        for (const file of files) {
            console.log('Processing file:', file.Key);
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
            // 1000 ms delay in master

            const t2 = parseFloat(round.master.nonceSentTime);
            const t3_c = parseFloat(measurement.clientReceivedNonceTimestamp);

            const t4_c = t3_c;
            const t5 = parseFloat(measurement.lambdaStartTimestamp);

            // NTP clockOffset  
            const clockOffset = ((t3_c - t2) + (t4_c - t5)) / 2;
            const clockOffset_master = -((t1 - t0_c) + (t2 - t3_c)) / 2;

            const clockOffset_diff = clockOffset_master - clockOffset;
            
            console.log('Clock offset:', clockOffset, clockOffset_master, clockOffset_diff, t2, t3_c, t4_c, t5, region);
            const t3 = t3_c - clockOffset_master;
            const t4 = t3

            const latency_slave = t5 - t4;
            const latency_master = t3 - t2;

            const latency_slave_2 = roundTripTime_master_client_slave - latency_master;
            const latency_master_2 = roundTripTime_client_master_client/2;
            
            round.regions.set(region, {
                latency_slave,
                latency_master,
                latency_slave_2,
                latency_master_2,
                roundTripTime_master_client_slave,
                roundTripTime_client_master_client
            });
            
            console.log('Added region data:', {
                region,
                latency_slave,
                latency_master,
                latency_slave_2,
                latency_master_2,
                roundTripTime_master_client_slave,
                roundTripTime_client_master_client
            });
        }

        roundsMap.set(nonce, round);
    }
    
    return roundsMap;
}

async function testHandler() {
    try {
        console.log('Starting test handler...');
        let processedVotes = 0;
        let updatedVotes = 0;
        let results = [];

        const content = testData.votes['test_vote.csv'];
        console.log('Test vote file content:', content);
        
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        console.log('CSV Headers:', headers);

        // Check if required headers exist
        const requiredHeaders = ['closest_region', 'latency_ms', 'roundtrip_ms'];
        if (!requiredHeaders.every(header => headers.includes(header))) {
            console.log('Required headers missing, skipping processing');
            return {
                processedVotes: 0,
                updatedVotes: 0,
                results: [],
                time: new Date(),
                error: 'Missing required headers: closest_region, latency_ms, roundtrip_ms'
            };
        }
        
        let updatedLines = [lines[0]]; // Keep header

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const voteData = parseCSVLine(line, headers);
            processedVotes++;
            
            console.log(`\nProcessing vote ${processedVotes}:`, {
                ip: voteData.ip,
                hasExistingTriangulation: !!(voteData.closest_region && voteData.latency_ms && voteData.roundtrip_ms)
            });

            if (voteData.closest_region && voteData.latency_ms && voteData.roundtrip_ms) {
                console.log('Vote already has triangulation data, skipping...');
                updatedLines.push(line);
                continue;
            }

            try {
                const triangulationPrefix = `triangulation/${voteData.ip.replace(/:/g, ';')}/`;
                console.log('Looking for triangulation data at:', triangulationPrefix);
                
                const triangulationFiles = await s3Client.send(new ListObjectsV2Command({
                    Bucket: 'ipvotes',
                    Prefix: triangulationPrefix
                }));

                if (!triangulationFiles.Contents?.length) {
                    console.log('No triangulation data found, skipping...');
                    updatedLines.push(line);
                    continue;
                }

                console.log('Found triangulation files:', 
                    triangulationFiles.Contents.map(f => f.Key)
                );

                const rounds = await processTriangulationFiles(triangulationFiles);
                
                // Find the best latency across all rounds
                let bestLatencyRegion = null;
                let bestLatency = Infinity;
                let bestRoundTripTimeMasterClientSlave = null;

                for (const round of rounds.values()) {
                    for (const [region, metrics] of round.regions.entries()) {
                        if (metrics.latency_slave < bestLatency || metrics.latency_slave_2 < bestLatency) {
                            bestLatency = metrics.latency_slave;
                            bestLatencyRegion = region;
                            bestRoundTripTimeMasterClientSlave = metrics.roundTripTime_master_client_slave;
                        }
                    }
                }

                console.log('Best results across all rounds:', {
                    region: bestLatencyRegion,
                    latency: bestLatency,
                    roundTripTimeMasterClientSlave: bestRoundTripTimeMasterClientSlave
                });

                if (bestLatencyRegion) {
                    voteData.closest_region = bestLatencyRegion;
                    voteData.latency_ms = bestLatency.toString();
                    voteData.roundtrip_ms = bestRoundTripTimeMasterClientSlave.toString();
                    updatedLines.push(objectToCSVLine(voteData, headers));
                    updatedVotes++;

                    results.push({
                        ip: voteData.ip,
                        region: bestLatencyRegion,
                        latency: bestLatency,
                        roundTripTimeMasterClientSlave: bestRoundTripTimeMasterClientSlave
                    });
                    console.log('Updated vote with triangulation data');
                } else {
                    console.log('No valid region found, keeping original line');
                    updatedLines.push(line);
                }

            } catch (error) {
                console.error(`Error processing triangulation for IP ${voteData.ip}:`, error);
                console.error('Stack trace:', error.stack);
                updatedLines.push(line);
                continue;
            }
        }

        console.log('\nWriting results...');
        
        // Write updated vote file
        await writeResults(
            `updated_test_vote.csv`, 
            updatedLines.join('\n')
        );

        // Write summary results
        const summary = {
            processedVotes,
            updatedVotes,
            results,
            time: new Date()
        };

        await writeResults(
            'processing_summary.json', 
            JSON.stringify(summary, null, 2)
        );

        console.log('Test completed successfully. Check test_output directory for results.');
        console.log('Summary:', summary);
        
        return summary;

    } catch (error) {
        console.error('Error in test processing:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

// Run the test
testHandler().catch(console.error);
