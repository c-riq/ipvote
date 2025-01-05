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
    const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix
    });
    const response = await s3Client.send(command);
    console.log(response)
    return response.Contents?.map(file => file.Key);
}

async function aggregateCSVFiles(bucket, files) {
    if (!files || files.length === 0) {
        throw new Error('No files found to aggregate');
    }
    
    const promises = files.map(async (file) => {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: file
        }));
        console.log(response)
        const records = await response?.Body?.transformToString();
        if (!records) {
            return { header: '', rows: [] };
        }
        
        const lines = records.split('\n');
        const header = lines[0] || '';
        const rows = lines.slice(1).filter(row => row.trim());  // Remove empty lines
        return { header, rows };
    });
    
    const results = await Promise.all(promises);
    if (!results.length || !results[0].header) {
        throw new Error('No valid data found in files');
    }
    
    const aggregatedData = results[0].header + '\n' + 
        results.flatMap(result => result.rows).join('\n');
    return aggregatedData;
}