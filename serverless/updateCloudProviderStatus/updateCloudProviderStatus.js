const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createIPRangeLookup, findCloudProvider } = require('./cloudProviderChecker');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes-test';

async function fetchCloudProviderRanges() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const csvPath = path.join(__dirname, 'combined-ip-ranges.csv');
        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        return lines.slice(1).map(line => {
            const [ip_prefix, cloud_provider, tag] = line.split(',');
            return { ip_prefix, cloud_provider, tag };
        });
    } catch (error) {
        console.error('Failed to fetch cloud provider ranges:', error);
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

async function updateFile(fileKey, rangeLookup) {
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey
        }));
        const content = await response.Body.transformToString();
        const lines = content.split('\n');
        
        const headerLine = lines[0];
        const currentColumns = headerLine.split(',');
        const cloudProviderIndex = currentColumns.indexOf('is_cloud_provider');
        
        if (cloudProviderIndex === -1) {
            console.log(`Skipping ${fileKey}: Missing 'is_cloud_provider' column in header`);
            return false;
        }

        let updatedRows = 0;
        const BATCH_SIZE = 1000;
        let batch = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const columns = lines[i].split(',');
            const ip = columns[1];
            
            const matchingProvider = findCloudProvider(ip, rangeLookup);
            const currentProvider = columns[cloudProviderIndex];
            const newProvider = matchingProvider || '';
            
            if (currentProvider !== newProvider) {
                columns[cloudProviderIndex] = newProvider;
                lines[i] = columns.join(',');
                updatedRows++;
            }
            
            batch.push(i);
            if (batch.length >= BATCH_SIZE) {
                console.log(`Processed ${i} rows in ${fileKey} (${updatedRows} updated)`);
                batch = [];
            }
        }

        if (updatedRows > 0) {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                Body: lines.join('\n'),
            }));
            console.log(`Successfully updated ${fileKey} (${updatedRows} rows)`);
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
        console.log('Starting cloud provider status update...');
        
        const cloudProviderRanges = await fetchCloudProviderRanges();
        console.log(`Fetched ${cloudProviderRanges.length} cloud provider ranges`);
        
        const rangeLookup = createIPRangeLookup(cloudProviderRanges);
        
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        const CONCURRENCY_LIMIT = 5;
        const results = [];
        
        for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
            const batch = files.slice(i, i + CONCURRENCY_LIMIT);
            const batchResults = await Promise.all(
                batch.map(file => updateFile(file.Key, rangeLookup))
            );
            results.push(...batchResults);
        }

        const updatedCount = results.filter(Boolean).length;
        console.log(`Update complete. Updated cloud provider status in ${updatedCount} of ${files.length} files.`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Successfully updated cloud provider status in ${updatedCount} files`,
                filesProcessed: files.length
            })
        };
    } catch (error) {
        console.error('Update failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to update cloud provider status',
                message: error.message
            })
        };
    }
}; 