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
        const currentColumns = headerLine.split(',');
        
        // Get index of column we need to check
        const captchaVerifiedIndex = currentColumns.indexOf('captcha_verified');
        
        let needsMigration = false;
        
        // Check if column needs to be added
        if (captchaVerifiedIndex === -1) {
            currentColumns.push('captcha_verified');
            needsMigration = true;
        }

        if (!needsMigration) {
            console.log(`File ${fileKey} already has captcha_verified column`);
            return false;
        }

        // Update header
        lines[0] = currentColumns.join(',');

        // Add empty values for new column to all data rows
        let processedRows = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const columns = lines[i].split(',');
            // Add empty value for missing column
            while (columns.length < currentColumns.length) {
                columns.push('');
            }
            lines[i] = columns.join(',');
            processedRows++;
            
            // Log progress every 100 rows
            if (processedRows % 100 === 0) {
                console.log(`Processed ${processedRows} rows in ${fileKey}`);
            }
        }

        // Write back to S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: lines.join('\n'),
        });
        await s3Client.send(command);
        console.log(`Successfully updated schema for ${fileKey} (${processedRows} rows)`);
        return true;
    } catch (error) {
        console.error(`Error processing file ${fileKey}:`, error);
        throw error;
    }
};

// Main execution function
async function main() {
    try {
        console.log('Starting schema migration for proxy columns...');
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Migrate each file
        let migratedCount = 0;
        for (const file of files) {
            const wasMigrated = await migrateFile(file.Key);
            if (wasMigrated) migratedCount++;
        }

        console.log(`Migration complete. Updated schema in ${migratedCount} of ${files.length} files.`);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run if called directly (not imported as a module)
if (require.main === module) {
    main().catch(console.error);
} 