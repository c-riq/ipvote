const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require("@aws-sdk/credential-providers");
const csv = require('csv-parse');
const { Readable } = require('stream');

const s3 = new S3Client({ 
    region: 'us-east-1',
    credentials: fromIni({
        profile: 'rix-admin-chris'
    })
});

const BUCKET = 'ipvotes';
const PREFIX = 'votes/';
const EXPECTED_COLUMNS = 12;
const TIMESTAMP_LENGTH = 13; // Unix timestamp in milliseconds

function splitConcatenatedLine(line) {
    console.log('Line length:', line.length);
    console.log('Expected columns:', EXPECTED_COLUMNS);
    
    const lastColumnFirstRow = line[EXPECTED_COLUMNS - 1];
    console.log('Last column of first row:', lastColumnFirstRow);
    console.log('Length of last column:', lastColumnFirstRow.length);
    
    if (lastColumnFirstRow && lastColumnFirstRow.length >= TIMESTAMP_LENGTH) {
        console.log('Attempting split...');
        const firstPart = lastColumnFirstRow.slice(0, -TIMESTAMP_LENGTH);
        const timestamp = lastColumnFirstRow.slice(-TIMESTAMP_LENGTH);
        console.log('Split into:', { firstPart, timestamp });
        
        const row1 = [...line.slice(0, EXPECTED_COLUMNS - 1), firstPart];
        const row2 = [timestamp, ...line.slice(EXPECTED_COLUMNS)];
        return [row1, row2];
    }

    console.log('Not splitting - timestamp conditions not met');
    return [line];
}

async function processS3File(key) {
    try {
        // Get the file from S3
        const response = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));

        // Convert the readable stream to string
        const content = await new Promise((resolve, reject) => {
            const chunks = [];
            response.Body.on('data', chunk => chunks.push(chunk));
            response.Body.on('error', reject);
            response.Body.on('end', () => resolve(Buffer.concat(chunks).toString()));
        });

        // Parse CSV content
        const records = await new Promise((resolve, reject) => {
            csv.parse(content, {
                skip_empty_lines: true,
                relax_column_count: true // Allow varying column counts
            }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });

        let hasChanges = false;
        const fixedRecords = [];
        fixedRecords.push(records[0]); // Keep header row

        // Process each row
        for (let i = 1; i < records.length; i++) {
            const columnCount = records[i].length;
            if (columnCount > EXPECTED_COLUMNS) {
                console.log(`Fixing issue in s3://${BUCKET}/${key}`);
                console.log(`  Line ${i + 1} has ${columnCount} columns`);
                console.log(`  Original: ${records[i].join(',')}\n`);
                
                const fixedRows = splitConcatenatedLine(records[i]);
                console.log('  Fixed rows:');
                fixedRows.forEach((row, index) => {
                    console.log(`    Row ${index + 1}: ${row.join(',')}`);
                    fixedRecords.push(row);
                });
                console.log('');
                hasChanges = true;
            } else {
                fixedRecords.push(records[i]);
            }
        }

        // Update the file if changes were made
        if (hasChanges) {
            const newContent = fixedRecords.map(row => row.join(',')).join('\n') + '\n';
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: newContent
            }));
            console.log(`Updated file: ${key}`);
        }
    } catch (error) {
        console.error(`Error processing ${key}:`, error);
    }
}

async function scanFiles() {
    try {
        console.log('Starting scan...');
        
        let continuationToken = undefined;
        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: PREFIX,
                ContinuationToken: continuationToken
            });

            const response = await s3.send(command);
            
            // Process each file
            for (const file of response.Contents || []) {
                await processS3File(file.Key);
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log('Scan completed!');
    } catch (error) {
        console.error('Error during scan:', error);
    }
}

// Run the scanner
scanFiles(); 
