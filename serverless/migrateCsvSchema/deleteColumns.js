const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const bucketName = process.env.BUCKET_NAME || 'ipvotes';

const fetchFileFromS3 = async (fileKey) => {
    const params = {
        Bucket: bucketName,
        Key: fileKey
    };
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString('utf-8');
    return content;
};

const writeFileToS3 = async (fileKey, content) => {
    const params = {
        Bucket: bucketName,
        Key: fileKey,
        Body: content,
        ContentType: 'text/csv'
    };
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
};

const deleteColumns = async (fileKey) => {
    try {
        // Read the file
        const content = await fetchFileFromS3(fileKey);
        const lines = content.split('\n');
        
        // Check if migration is needed
        const headerLine = lines[0];
        const currentColumns = headerLine.split(',');
        const expectedColumnCount = currentColumns.length;
        
        // Get indices of columns to delete
        const nonceIndex = currentColumns.indexOf('nonce');
        const countryIndex = currentColumns.indexOf('country');
        
        if (nonceIndex === -1 && countryIndex === -1) {
            console.log('No nonce or country columns found, skipping migration');
            return;
        }

        // Remove the columns from each line and validate row lengths
        const migratedLines = lines.map((line, index) => {
            if (!line.trim()) return line; // Skip empty lines
            
            const values = line.split(',');
            if (values.length !== expectedColumnCount) {
                throw new Error(`Row ${index + 1} has ${values.length} columns, expected ${expectedColumnCount}`);
            }
            
            // Remove columns from highest index first to avoid shifting issues
            const indicesToRemove = [nonceIndex, countryIndex]
                .filter(idx => idx !== -1)
                .sort((a, b) => b - a);
            
            for (const idx of indicesToRemove) {
                values.splice(idx, 1);
            }
            
            return values.join(',');
        });

        // Join lines back together
        const migratedContent = migratedLines.join('\n');

        // Write back to S3
        await writeFileToS3(fileKey, migratedContent);
        console.log(`Successfully migrated file: ${fileKey}`);

    } catch (error) {
        console.error(`Error migrating file ${fileKey}:`, error);
        throw error;
    }
};

async function main() {
    try {
        // List all objects in the bucket
        const params = {
            Bucket: bucketName,
            Prefix: 'votes/'
        };
        
        const command = new ListObjectsV2Command(params);
        const data = await s3Client.send(command);
        
        // Process each CSV file
        const migrationPromises = data.Contents
            .filter(obj => obj.Key.endsWith('.csv'))
            .map(obj => deleteColumns(obj.Key));
        
        await Promise.all(migrationPromises);
        
        console.log('Migration completed successfully');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main(); 