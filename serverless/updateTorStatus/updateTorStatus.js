const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';

async function fetchTorExitNodes() {
    try {
        const fs = require('fs');
        const path = require('path');
        const data = fs.readFileSync(path.join(__dirname, './data/tor-exit-nodes.csv'), 'utf8');
        return new Set(data.split('\n').filter(ip => ip.split(',')[0]));
    } catch (error) {
        console.error('Failed to fetch TOR exit nodes:', error);
        throw error;
    }
}

async function listAllVoteFiles() {
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
}

async function updateFile(fileKey, torExitNodes) {
    try {
        // Read the file
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey
        }));
        const content = await response.Body.transformToString();
        const lines = content.split('\n');
        
        // Check header
        const headerLine = lines[0];
        const currentColumns = headerLine.split(',');
        const isTorIndex = currentColumns.indexOf('is_tor');
        
        if (isTorIndex === -1) {
            console.error(`Skipping ${fileKey}: Missing 'is_tor' column in header`);
            return false;
        }

        let processedRows = 0;
        let updatedRows = 0;

        // Update each data row
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const columns = lines[i].split(',');
            const ip = columns[1]; // IP is always the second column
            const currentTorStatus = columns[isTorIndex];
            const newTorStatus = torExitNodes.has(ip) ? '1' : '0';
            
            if (currentTorStatus !== newTorStatus) {
                columns[isTorIndex] = newTorStatus;
                lines[i] = columns.join(',');
                updatedRows++;
            }
            
            processedRows++;
            if (processedRows % 100 === 0) {
                console.log(`Processed ${processedRows} rows in ${fileKey} (${updatedRows} updated)`);
            }
        }

        // Only write back to S3 if changes were made
        if (updatedRows > 0) {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                Body: lines.join('\n'),
            }));
            console.log(`Successfully updated ${fileKey} (${updatedRows} of ${processedRows} rows)`);
            return true;
        }
        
        console.log(`No updates needed for ${fileKey}`);
        return false;
    } catch (error) {
        console.error(`Error processing file ${fileKey}:`, error);
        throw error;
    }
}

exports.handler = async (event) => {
    try {
        console.log('Starting TOR status update...');
        
        // Fetch TOR exit nodes
        const torExitNodes = await fetchTorExitNodes();
        console.log(`Fetched ${torExitNodes.size} TOR exit nodes`);
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Update each file
        let updatedCount = 0;
        for (const file of files) {
            const wasUpdated = await updateFile(file.Key, torExitNodes);
            if (wasUpdated) updatedCount++;
        }

        console.log(`Update complete. Updated TOR status in ${updatedCount} of ${files.length} files.`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Successfully updated TOR status in ${updatedCount} files`,
                filesProcessed: files.length
            })
        };
    } catch (error) {
        console.error('Update failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to update TOR status',
                message: error.message
            })
        };
    }
}; 