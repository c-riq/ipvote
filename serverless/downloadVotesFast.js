const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client(); 

exports.handler = async (event) => {
    const bucket = 'ipvotes';
    const poll = event?.queryStringParameters?.poll;
    if (!poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing poll parameter',
                time: new Date()
            }),
        };
    }
    const prefix = `votes/poll=${poll}/ip_prefix=`;
    
    try {
        // List all CSV files in the bucket with the given prefix
        const files = await listAllS3Files(bucket, prefix);
        console.log(files)
        
        // Read and aggregate all CSV data
        const aggregatedData = await aggregateCSVFiles(bucket, files);
        
        return {
            statusCode: 200,
            body: aggregatedData,
            headers: {
                'Content-Type': 'text/csv'
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
        console.log('ListObjectsV2Command response:', response);
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

async function aggregateCSVFiles(bucket, files) {
    try {
        if (!files || files.length === 0) {
            throw new Error('No files found to aggregate');
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
                            columns[1] = maskIP(columns[1]);
                        }
                        return columns.join(',');
                    });
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
        
        const aggregatedData = results[0].header.replace('poll_', 'poll').replace('ip', 'masked_ip') + '\n' + 
            results.flatMap(result => result.rows).join('\n');
        return aggregatedData;
    } catch (error) {
        console.error('Error in aggregateCSVFiles:', error);
        throw error;
    }
}