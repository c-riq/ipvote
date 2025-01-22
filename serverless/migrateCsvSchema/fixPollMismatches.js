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

const fixFile = async (fileKey) => {
    try {
        // Extract poll name from path
        const pollFromPath = fileKey.split('/')[1]?.split('.')[0]?.replace('poll=', '');
        if (!pollFromPath) {
            console.log(`Skipping ${fileKey} - cannot determine poll from path`);
            return false;
        }

        // Read the file
        const content = await fetchFileFromS3(fileKey);
        const lines = content.split('\n');
        
        let processedRows = 0;
        let fixedRows = 0;
        
        // Get poll column index (should be third column based on schema)
        const headerLine = lines[0];
        const columns = headerLine.split(',');
        const pollIndex = columns.indexOf('poll_');
        
        if (pollIndex === -1) {
            console.log(`Skipping ${fileKey} - no poll column found`);
            return false;
        }

        // Process each line
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const rowColumns = lines[i].split(',');
            const currentPoll = rowColumns[pollIndex];
            
            if (currentPoll !== pollFromPath) {
                rowColumns[pollIndex] = pollFromPath;
                lines[i] = rowColumns.join(',');
                fixedRows++;
            }
            
            processedRows++;
            
            // Log progress every 100 rows
            if (processedRows % 100 === 0) {
                console.log(`Processed ${processedRows} rows in ${fileKey} (${fixedRows} fixed)`);
            }
        }

        // Only write back to S3 if we made changes
        if (fixedRows > 0) {
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                Body: lines.join('\n'),
            });
            await s3Client.send(command);
            console.log(`Successfully updated ${fileKey} (${fixedRows} of ${processedRows} rows)`);
            return true;
        } else {
            console.log(`No fixes needed for ${fileKey}`);
            return false;
        }
    } catch (error) {
        console.error(`Error processing file ${fileKey}:`, error);
        throw error;
    }
};

// Main execution function
async function main() {
    try {
        console.log('Starting poll mismatch fixes...');
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Fix each file
        let fixedCount = 0;
        for (const file of files) {
            const wasFixed = await fixFile(file.Key);
            if (wasFixed) fixedCount++;
        }

        console.log(`Fix complete. Updated ${fixedCount} of ${files.length} files.`);
    } catch (error) {
        console.error('Fix failed:', error);
        process.exit(1);
    }
}

// Run if called directly (not imported as a module)
if (require.main === module) {
    main().catch(console.error);
} 