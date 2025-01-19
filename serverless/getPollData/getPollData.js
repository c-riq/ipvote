const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

/* schema of csv file:
time,ip,poll_,vote,country,nonce,country_geoip,asn_name_geoip
1716891868980,146.103.108.202,1_or_2,2,,sdfsdf,AU,TPG Telecom Limited
*/

const s3Client = new S3Client(); 

exports.handler = async (event) => {
    const bucket = 'ipvotes';
    const poll = event?.queryStringParameters?.poll;
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    const excludeTor = event?.queryStringParameters?.excludeTor === 'true';
    
    if (!poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing poll parameter',
                time: new Date()
            }),
        };
    }

    const cacheKey = `votes_aggregated_and_masked/poll=${poll}/excludeTor=${excludeTor}.csv`;
    
    try {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            try {
                const cachedData = await s3Client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: cacheKey
                }));
                const data = await cachedData.Body.transformToString();
                console.log('Cache hit - returning cached data');
                return {
                    statusCode: 200,
                    body: data,
                    headers: {
                        'Content-Type': 'text/csv',
                        'X-Cache': 'HIT'
                    }
                };
            } catch (error) {
                console.log('Cache miss or error:', error.message);
            }
        }

        // Proceed with original aggregation logic
        const prefix = `votes/poll=${poll}/ip_prefix=`;
        const files = await listAllS3Files(bucket, prefix);
        const aggregatedData = await aggregateCSVFiles(bucket, files, excludeTor);

        // Cache the results
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: cacheKey,
            Body: aggregatedData,
            ContentType: 'text/csv'
        }));

        return {
            statusCode: 200,
            body: aggregatedData,
            headers: {
                'Content-Type': 'text/csv',
                'X-Cache': 'MISS'
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to aggregate CSV files' })
        };
    }
};

async function listAllS3Files(bucket, prefix) {
    try {
        const command = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix
        });
        const response = await s3Client.send(command);
        return response.Contents?.map(file => file.Key);
    } catch (error) {
        console.error('Error in listAllS3Files:', error);
        throw error;
    }
}

function maskIP(ip) {
    try {
        if (ip.includes('.')) {
            // IPv4
            const parts = ip.split('.');
            return `${parts[0]}.${parts[1]}.${parts[2]}.XXX`;
        } else {
            // IPv6
            const parts = ip.split(':');
            const thirdOctet = parts[2] || '';
            const paddedThird = thirdOctet.padStart(4, '0');
            const maskedThird = paddedThird.substring(0, 2) + 'XX';
            return `${parts[0]}:${parts[1]}:${maskedThird}:XXXX:XXXX:XXXX`;
        }
    } catch (error) {
        console.error('Error in maskIP:', error, 'IP:', ip);
        throw error;
    }
}

async function aggregateCSVFiles(bucket, files, excludeTor) {
    try {
        if (!files || files.length === 0) {
            throw new Error('No files found to aggregate');
        }

        // Fetch Tor exit nodes if needed
        let torExitNodes = new Set();
        if (excludeTor) {
            try {
                const torResponse = await s3Client.send(new GetObjectCommand({
                    Bucket: 'geoiprix',
                    Key: 'tor-exit-nodes.csv'
                }));
                const torData = await torResponse.Body.transformToString();
                torExitNodes = new Set(torData.split('\n').filter(ip => ip.split(',')[0]));
            } catch (error) {
                console.warn('Failed to fetch TOR exit nodes:', error);
            }
        }
        
        const promises = files.map(async (file) => {
            try {
                const response = await s3Client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: file
                }));
                
                const records = await response.Body.transformToString();
                if (!records) {
                    console.warn('Empty records for file:', file);
                    return { header: '', rows: [] };
                }
                
                const lines = records.split('\n');
                const header = lines[0] || '';
                const rows = lines.slice(1)
                    .filter(row => row.trim())
                    .map(row => {
                        const columns = row.split(',');
                        if (columns.length >= 2) {
                            // Skip Tor exit nodes if excludeTor is true
                            if (excludeTor && torExitNodes.has(columns[1])) {
                                return null;
                            }
                            
                            // Just mask the IP and keep existing data
                            columns[1] = maskIP(columns[1]);
                        }
                        return columns.join(',');
                    })
                    .filter(row => row !== null); // Remove filtered out TOR IPs
                return { header, rows };
            } catch (error) {
                console.error('Error processing file:', file, error);
                throw error;
            }
        });
        
        const results = await Promise.all(promises);
        if (!results.length || !results[0].header) {
            throw new Error('No valid data found in files');
        }
        
        // Keep the header as is, just replace poll_ with poll and ip with masked_ip
        const aggregatedData = results[0].header.replace('poll_', 'poll').replace('ip', 'masked_ip') + '\n' + 
            results.flatMap(result => result.rows).join('\n');
        return aggregatedData;
    } catch (error) {
        console.error('Error in aggregateCSVFiles:', error);
        throw error;
    }
}
