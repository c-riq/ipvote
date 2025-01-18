const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';

const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

const fetchFileFromS3 = async (key) => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    const response = await s3Client.send(command);
    return streamToString(response.Body);
};

const listAllVoteFiles = async () => {
    const files = [];
    let continuationToken = undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'votes/',
            ContinuationToken: continuationToken
        });
        
        const response = await s3Client.send(command);
        files.push(...(response.Contents || []).filter(obj => obj.Key.endsWith('votes.csv')));
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
};

const migrateFile = async (fileKey) => {
    try {
        // Read the file
        const content = await fetchFileFromS3(fileKey);
        const lines = content.split('\n');
        
        // Check if migration is needed
        const headerLine = lines[0];
        if (headerLine.includes(',nonce')) {
            console.log(`File ${fileKey} already has nonce column`);
            return false;
        }

        // Update header
        lines[0] = 'time,ip,poll_,vote,country,nonce';

        // Add empty nonce field to all data rows
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                lines[i] = `${lines[i].trim()},`;
            }
        }

        // Write back to S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: lines.join('\n'),
        });
        await s3Client.send(command);
        console.log(`Successfully migrated ${fileKey}`);
        return true;
    } catch (error) {
        console.error(`Error migrating file ${fileKey}:`, error);
        throw error;
    }
};

module.exports.handler = async (event) => {
    try {
        console.log('Starting CSV schema migration...');
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Migrate each file
        let migratedCount = 0;
        for (const file of files) {
            const wasMigrated = await migrateFile(file.Key);
            if (wasMigrated) migratedCount++;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Migration complete. Migrated ${migratedCount} of ${files.length} files.`,
                time: new Date()
            })
        };
    } catch (error) {
        console.error('Migration failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Migration failed: ' + error.message,
                time: new Date()
            })
        };
    }
}; 