const { S3Client, ListObjectsV2Command, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require("@aws-sdk/credential-providers");
const fs = require('fs');

const s3 = new S3Client({ 
    region: 'us-east-1',
    credentials: fromIni({
        profile: 'rix-admin-chris'
    })
});

const BUCKET = 'ipvotes';
const VOTES_PREFIX = 'votes/poll=';

async function checkIfPollDisabled(pollPath) {
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: BUCKET,
            Key: `${VOTES_PREFIX}${pollPath}/disabled`
        }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        console.error(`Error checking disabled status for ${pollPath}:`, error);
        return false;
    }
}

// New function to read existing CSV data
async function readExistingCsv() {
    const pollStates = new Map();
    try {
        const content = fs.readFileSync('data/moderate_polls.csv', 'utf-8');
        const lines = content.split('\n');
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [pollPath, disabled] = line.split(',');
                pollStates.set(pollPath, disabled === 'true');
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error reading CSV file:', error);
        }
        // File doesn't exist, return empty map
    }
    return pollStates;
}

// New function to sync disabled status in S3
async function syncDisabledStatus(pollPath, shouldBeDisabled) {
    try {
        const disabledKey = `${VOTES_PREFIX}${pollPath}/disabled`;
        const isCurrentlyDisabled = await checkIfPollDisabled(pollPath);

        if (shouldBeDisabled && !isCurrentlyDisabled) {
            // Add disabled file
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: disabledKey,
                Body: ''
            }));
            console.log(`Disabled poll: ${pollPath}`);
        } else if (!shouldBeDisabled && isCurrentlyDisabled) {
            // Remove disabled file
            await s3.send(new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: disabledKey
            }));
            console.log(`Enabled poll: ${pollPath}`);
        }
    } catch (error) {
        console.error(`Error syncing disabled status for ${pollPath}:`, error);
    }
}

async function fetchPollPaths() {
    try {
        console.log('Reading existing poll states...');
        const pollStates = await readExistingCsv();
        
        console.log('Fetching poll paths...');
        const pollPaths = new Set();
        let continuationToken = undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: VOTES_PREFIX,
                Delimiter: '/',
                ContinuationToken: continuationToken
            });

            const response = await s3.send(command);
            
            // Extract unique poll paths from common prefixes
            for (const prefix of response.CommonPrefixes || []) {
                const pollPath = prefix.Prefix.replace(VOTES_PREFIX, '').replace('/', '');
                if (pollPath) {
                    pollPaths.add(pollPath);
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        // Sync S3 state and prepare new CSV content
        let csvContent = 'poll_path,disabled\n';
        
        // Process existing and new polls
        for (const pollPath of pollPaths) {
            let isDisabled;
            if (pollStates.has(pollPath)) {
                // Use existing state and sync to S3
                isDisabled = pollStates.get(pollPath);
                await syncDisabledStatus(pollPath, isDisabled);
            } else {
                // New poll, check current S3 state
                isDisabled = await checkIfPollDisabled(pollPath);
            }
            csvContent += `${pollPath},${isDisabled}\n`;
        }

        // Write updated CSV
        fs.writeFileSync('data/moderate_polls.csv', csvContent);
        console.log(`Successfully processed ${pollPaths.size} poll paths and updated data/moderate_polls.csv`);

    } catch (error) {
        console.error('Error processing poll paths:', error);
    }
}

// Run the script
fetchPollPaths(); 
