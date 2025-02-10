const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require("@aws-sdk/credential-providers");
const csv = require('csv-parse');

const s3 = new S3Client({ 
    region: 'us-east-1',
    credentials: fromIni({
        profile: 'rix-admin-chris'
    })
});

const BUCKET = 'ipvotes';
const VOTES_PREFIX = 'votes/poll=';

// Define poll name mappings (source -> target)
const POLL_MAPPINGS = {
    'Abolish_the_US_Electoral_College': 'Abolish the US Electoral College',
    // Add more mappings as needed
};

async function processS3File(sourceKey, targetKey) {
    try {
        // Get the source file from S3
        const sourceResponse = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: sourceKey
        }));

        // Convert the source readable stream to string
        const sourceContent = await new Promise((resolve, reject) => {
            const chunks = [];
            sourceResponse.Body.on('data', chunk => chunks.push(chunk));
            sourceResponse.Body.on('error', reject);
            sourceResponse.Body.on('end', () => resolve(Buffer.concat(chunks).toString()));
        });

        // Parse source CSV content
        const sourceRecords = await new Promise((resolve, reject) => {
            csv.parse(sourceContent, {
                skip_empty_lines: true,
                relax_column_count: true
            }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });

        // Try to get existing target file
        let targetRecords = [];
        let targetExists = false;
        try {
            const targetResponse = await s3.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: targetKey
            }));
            const targetContent = await new Promise((resolve, reject) => {
                const chunks = [];
                targetResponse.Body.on('data', chunk => chunks.push(chunk));
                targetResponse.Body.on('error', reject);
                targetResponse.Body.on('end', () => resolve(Buffer.concat(chunks).toString()));
            });
            targetRecords = await new Promise((resolve, reject) => {
                csv.parse(targetContent, {
                    skip_empty_lines: true,
                    relax_column_count: true
                }, (err, records) => {
                    if (err) reject(err);
                    else resolve(records);
                });
            });
            targetExists = true;
        } catch (error) {
            if (error.name !== 'NoSuchKey') {
                throw error;
            }
        }

        // Get existing IPs from target file
        const existingIPs = new Set(targetRecords.slice(1).map(record => record[1]));

        // Update poll name and filter out duplicate IPs
        const updatedRecords = sourceRecords.map((record, index) => {
            if (index === 0) return record; // Keep header row as is
            const ip = record[1];
            const pollIndex = 2;
            const oldPollName = record[pollIndex];
            record[pollIndex] = POLL_MAPPINGS[oldPollName] || oldPollName;
            return record;
        }).filter((record, index) => {
            if (index === 0) return true; // Always keep header
            return !existingIPs.has(record[1]); // Filter out duplicate IPs
        });

        if (updatedRecords.length <= 1) {
            console.log(`No new records to add for ${targetKey} (all IPs already exist)`);
            return;
        }

        // Prepare final content
        let finalRecords;
        if (targetExists) {
            // If target exists, append only the data rows (skip header)
            finalRecords = [...targetRecords, ...updatedRecords.slice(1)];
        } else {
            // If target doesn't exist, include the header
            finalRecords = updatedRecords;
        }

        const newContent = finalRecords.map(row => row.join(',')).join('\n') + '\n';

        // Upload to target location
        console.log(`Uploading ${updatedRecords.length - 1} new records to ${targetKey}`);
        console.log('targetKey', targetKey);

        console.log('newContent', newContent);
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: targetKey,
            Body: newContent
        }));

        console.log(`Merged ${sourceKey} into ${targetKey}`);
    } catch (error) {
        console.error(`Error processing ${sourceKey}:`, error);
    }
}

async function mergePolls() {
    try {
        console.log('Starting poll merge...');
        
        for (const [sourcePoll, targetPoll] of Object.entries(POLL_MAPPINGS)) {
            console.log(`Merging "${sourcePoll}" into "${targetPoll}"...`);
            
            // List all partitions for the source poll
            let continuationToken = undefined;
            do {
                const command = new ListObjectsV2Command({
                    Bucket: BUCKET,
                    Prefix: `${VOTES_PREFIX}${sourcePoll}/`,
                    ContinuationToken: continuationToken
                });

                const response = await s3.send(command);
                
                // Process each partition file
                for (const file of response.Contents || []) {
                    const sourceKey = file.Key;
                    // Create corresponding target key with new poll name
                    const targetKey = sourceKey.replace(
                        `${VOTES_PREFIX}${sourcePoll}/`,
                        `${VOTES_PREFIX}${targetPoll}/`
                    );
                    await processS3File(sourceKey, targetKey);
                }

                continuationToken = response.NextContinuationToken;
            } while (continuationToken);
        }

        console.log('Poll merge completed!');
    } catch (error) {
        console.error('Error during merge:', error);
    }
}

// Run the merger
mergePolls(); 