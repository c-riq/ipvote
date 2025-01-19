const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: 'us-east-1'
});
const BUCKET_NAME = 'ipvotes';

const invalidateCache = async () => {
    try {
        console.log('Starting cache invalidation...');
        let deletedCount = 0;
        let continuationToken = undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: 'votes_aggregated_and_masked/',
                ContinuationToken: continuationToken
            });
            
            const response = await s3Client.send(command);
            if (response.Contents && response.Contents.length > 0) {
                for (const obj of response.Contents) {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: obj.Key
                    });
                    await s3Client.send(deleteCommand);
                    deletedCount++;
                    
                    // Log progress every 100 deletions
                    if (deletedCount % 100 === 0) {
                        console.log(`Deleted ${deletedCount} files...`);
                    }
                }
            }
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`Successfully deleted ${deletedCount} cached files`);
    } catch (error) {
        console.error('Cache invalidation failed:', error);
        throw error;
    }
};

// Main execution function
async function main() {
    try {
        await invalidateCache();
        console.log('Cache invalidation complete');
    } catch (error) {
        console.error('Operation failed:', error);
        process.exit(1);
    }
}

// Run if called directly (not imported as a module)
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { invalidateCache }; 
