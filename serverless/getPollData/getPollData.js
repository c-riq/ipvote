const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { processDelegations } = require('./processDelegations');

/* schema of csv file:
time,ip,poll_,vote,country,nonce,country_geoip,asn_name_geoip
1716891868980,146.103.108.202,1_or_2,2,,sdfsdf,AU,TPG Telecom Limited
*/

const s3Client = new S3Client(); 

const removeForbiddenStrings = (str) => {
    return str.replace(/,|\\n|\\r|\\t|>|<|"/g, '');
}

exports.handler = async (event) => {
    const bucket = 'ipvotes';
    let poll = event?.queryStringParameters?.poll;
    
    if (!poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing poll parameter',
                time: new Date()
            }),
        };
    }

    poll = poll.replace(/,/g, '%2C');
    const isOpen = event?.queryStringParameters?.isOpen === 'true';
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    
    if (!poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing poll parameter',
                time: new Date()
            }),
        };
    }

    // Prevent direct access to open_ prefixed polls
    if (poll.startsWith('open_')) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid poll name',
                time: new Date()
            }),
        };
    }

    const pollPath = isOpen ? `open_${poll}` : poll;
    const cacheKey = `votes_aggregated_and_masked/poll=${pollPath}/votes.csv`;
    
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
                        'X-Cache': 'HIT',
                        'Content-Disposition': `attachment; filename="${poll}_results.csv"`
                    }
                };
            } catch (error) {
                console.log('Cache miss or error:', error.message);
            }
        }

        // Proceed with original aggregation logic
        const prefix = `votes/poll=${pollPath}/ip_prefix=`;
        const files = await listAllS3Files(bucket, prefix);
        const aggregatedData = await aggregateCSVFiles(bucket, files);

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
                'X-Cache': 'MISS',
                'Content-Disposition': `attachment; filename="${poll}_results.csv"`
            }
        };
    } catch (error) {
        console.error('Error:', error);
        console.log('poll:', poll);
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
            const thirdOctet = parts[2] || '';
            const paddedThird = thirdOctet.padStart(3, '0');
            const maskedThird = paddedThird.substring(0, 2) + 'X';
            return `${parts[0]}.${parts[1]}.${maskedThird}.XXX`;
        } else {
            // IPv6
            const parts = ip.split(':');
            const thirdOctet = parts[2] || '';
            const paddedThird = thirdOctet.padStart(4, '0');
            const maskedThird = paddedThird.substring(0, 1) + 'XXX';
            return `${parts[0]}:${parts[1]}:${maskedThird}:XXXX:XXXX:XXXX`;
        }
    } catch (error) {
        console.error('Error in maskIP:', error, 'IP:', ip);
        throw error;
    }
}

function maskPhoneNumber(phone) {
    if (!phone) return '';
    // Keep country code and first digits, mask the last 6 digits
    // Example: +491234567890 -> +491234XXXXXX
    return phone.replace(/(\+\d+)(\d{6})$/, '$1XXXXXX');
}

async function aggregateCSVFiles(bucket, files) {
    try {
        if (!files || files.length === 0) {
            throw new Error('No files found to aggregate');
        }

        // Fetch delegation graph
        const delegationGraphResponse = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: 'delegationGraph/latest/full.json'
        }));
        const delegationGraph = JSON.parse(await delegationGraphResponse.Body.transformToString());
        
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
                const headerColumns = header.split(',');
                const columnIndices = {
                    time: headerColumns.indexOf('time'),
                    ip: headerColumns.indexOf('ip'),
                    country_geoip: headerColumns.indexOf('country_geoip'),
                    asn_name_geoip: headerColumns.indexOf('asn_name_geoip'),
                    phone: headerColumns.indexOf('phone') // might be -1 if not present
                };

                const rows = lines.slice(1)
                    .filter(row => row.trim())
                    .map(row => {
                        const columns = row.split(',');
                        if (columns.length < 2) return null;
                        
                        // Mask IP and sanitize fields
                        if (columnIndices.ip !== -1) {
                            columns[columnIndices.ip] = maskIP(columns[columnIndices.ip]);
                        }
                        if (columnIndices.country_geoip !== -1) {
                            columns[columnIndices.country_geoip] = removeForbiddenStrings(columns[columnIndices.country_geoip]);
                        }
                        if (columnIndices.asn_name_geoip !== -1) {
                            columns[columnIndices.asn_name_geoip] = removeForbiddenStrings(columns[columnIndices.asn_name_geoip]);
                        }
                        // Mask phone number if present
                        if (columnIndices.phone !== -1) {
                            columns[columnIndices.phone] = maskPhoneNumber(columns[columnIndices.phone]);
                        }
                        return columns.join(',');
                    })
                    .filter(Boolean);
                return { header, rows, columnIndices };
            } catch (error) {
                console.error('Error processing file:', file, error);
                throw error;
            }
        });
        
        const results = await Promise.all(promises);
        if (!results.length) {
            throw new Error('No valid data found in files');
        }

        // Keep the header as is, just replace poll_ with poll and ip with masked_ip
        const header = results[0].header.replace('poll_', 'poll').replace('ip', 'masked_ip') + ',delegated_votes,delegated_votes_from_verified_phone_numbers' + '\n';
        const columnIndices = results[0].columnIndices;

        // Process all rows and track who has voted
        const allRows = results.flatMap(result => result.rows)
            .sort((a, b) => {
                const timeA = parseInt(a.split(',')[columnIndices.time]);
                const timeB = parseInt(b.split(',')[columnIndices.time]);
                return timeA - timeB;
            })
            .map(row => {
                const columns = row.split(',');
                // Convert Unix timestamp (milliseconds) to ISO string
                if (columnIndices.time !== -1) {
                    columns[columnIndices.time] = new Date(parseInt(columns[columnIndices.time])).toISOString();
                }
                return columns.join(',');
            });

        // Process delegations using the new pure function with header
        const processedRows = processDelegations(allRows, delegationGraph, results[0].header);

        const aggregatedData = header + processedRows.join('\n');
        return aggregatedData;
    } catch (error) {
        console.error('Error in aggregateCSVFiles:', error);
        throw error;
    }
}
