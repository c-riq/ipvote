const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require("@aws-sdk/credential-providers");

const s3 = new S3Client({ 
    region: 'us-east-1',
    credentials: fromIni({
        profile: 'rix-admin-chris'
    })
});

const BUCKET = 'ipvotes';
const VOTES_PREFIX = 'votes/poll=';

async function deletePoll(pollName) {
    try {
        console.log(`Starting deletion of poll: "${pollName}"...`);
        
        let continuationToken = undefined;
        let deletedCount = 0;

        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: `${VOTES_PREFIX}${pollName}/`,
                ContinuationToken: continuationToken
            });

            const response = await s3.send(command);
            
            // Delete each partition file
            for (const file of response.Contents || []) {
                const key = file.Key;
                await s3.send(new DeleteObjectCommand({
                    Bucket: BUCKET,
                    Key: key
                }));
                deletedCount++;
                console.log(`Deleted: ${key}`);
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`Successfully deleted ${deletedCount} files for poll: "${pollName}"`);
    } catch (error) {
        console.error('Error during deletion:', error);
    }
}

// Check if poll name was provided as command line argument
const pollToDelete = process.argv[2];
if (!pollToDelete) {
    console.error('Please provide a poll name as a command line argument');
    process.exit(1);
}

// Run the deletion
deletePoll(pollToDelete); 