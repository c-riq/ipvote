const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const PROFILES_BUCKET = 'ipvotes';

exports.handler = async (event) => {
    try {
        // List all delegation files
        const listCommand = new ListObjectsV2Command({
            Bucket: PROFILES_BUCKET,
            Prefix: 'delegation/',
        });
        
        const { Contents } = await s3Client.send(listCommand);
        const edges = [];
        
        // Process each delegation file
        for (const item of Contents) {
            if (!item.Key.endsWith('.csv')) continue;
            
            const command = new GetObjectCommand({
                Bucket: PROFILES_BUCKET,
                Key: item.Key,
            });
            
            const response = await s3Client.send(command);
            const data = await response.Body.transformToString();
            
            // Process CSV content
            const lines = data.split('\n').filter(line => line.trim());
            for (const line of lines) {
                if (line === 'source,target,category,time') continue; // Skip header
                const [source, target, category, time] = line.split(',');
                edges.push({
                    source,
                    target,
                    category,
                    timestamp: time
                });
            }
        }
        
        // Save the aggregated edges
        const command = new PutObjectCommand({
            Bucket: PROFILES_BUCKET,
            Key: 'delegation/edges.json',
            Body: JSON.stringify(edges, null, 2),
            ContentType: 'application/json',
            CacheControl: 'max-age=300' // 5 minute cache
        });
        
        await s3Client.send(command);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Delegation edges index updated successfully',
                edgeCount: edges.length
            })
        };
    } catch (error) {
        console.error('Aggregation error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to aggregate delegation edges',
                error: error.message
            })
        };
    }
}; 
