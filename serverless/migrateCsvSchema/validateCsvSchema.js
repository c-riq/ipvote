const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';

const EXPECTED_HEADERS = [
    'time', 'ip', 'poll_', 'vote', 'country_geoip', 'asn_name_geoip',
    'is_tor', 'is_vpn', 'is_cloud_provider', 'closest_region',
    'latency_ms', 'roundtrip_ms', 'captcha_verified', 'phone_number'
];

// Reuse your existing helper functions
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

const validateFile = async (fileKey) => {
    try {
        const content = await fetchFileFromS3(fileKey);
        const lines = content.split('\n').filter(line => line.trim());
        
        const issues = [];
        let needsSave = false;
        let modifiedLines = [...lines];
        
        // Validate headers
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Check exact header order
        for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
            if (headers[i] !== EXPECTED_HEADERS[i]) {
                issues.push(`Header mismatch at position ${i + 1}: Expected '${EXPECTED_HEADERS[i]}', found '${headers[i] || 'missing'}'`);
            }
        }
        
        // Check for and remove extra headers
        if (headers.length > EXPECTED_HEADERS.length) {
            const extraHeaders = headers.slice(EXPECTED_HEADERS.length);
            issues.push(`Removing extra headers: ${extraHeaders.join(', ')}`);
            
            // Fix headers
            modifiedLines[0] = EXPECTED_HEADERS.join(',');
            
            // Remove extra columns from all data rows
            for (let i = 1; i < modifiedLines.length; i++) {
                if (!modifiedLines[i].trim()) continue;
                const columns = modifiedLines[i].split(',');
                if (columns.length > EXPECTED_HEADERS.length) {
                    modifiedLines[i] = columns.slice(0, EXPECTED_HEADERS.length).join(',');
                }
            }
            needsSave = true;
        }
        
        // Check column count consistency
        const expectedColumnCount = EXPECTED_HEADERS.length;
        
        for (let i = 1; i < lines.length; i++) {
            const columnCount = lines[i].split(',').length;
            if (columnCount !== expectedColumnCount) {
                issues.push(`Row ${i + 1}: Expected ${expectedColumnCount} columns, found ${columnCount}`);
                if (issues.length >= 10) {
                    issues.push('... more issues found (truncated)');
                    break;
                }
            }
        }
        
        // Save the file if modifications were made
        if (needsSave) {
            try {
                const command = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileKey,
                    Body: modifiedLines.join('\n'),
                });
                await s3Client.send(command);
                issues.push('File was automatically fixed and saved');
            } catch (saveError) {
                issues.push(`Failed to save fixed file: ${saveError.message}`);
            }
        }
        
        return {
            fileKey,
            hasIssues: issues.length > 0,
            issues,
            wasFixed: needsSave
        };
        
    } catch (error) {
        return {
            fileKey,
            hasIssues: true,
            issues: [`Error processing file: ${error.message}`],
            wasFixed: false
        };
    }
};

async function main() {
    try {
        console.log('Starting CSV schema validation...');
        
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to validate`);
        
        let filesWithIssues = 0;
        let filesFixed = 0;
        let processedFiles = 0;
        
        for (const file of files) {
            const result = await validateFile(file.Key);
            processedFiles++;
            
            // Log progress every 10 files
            if (processedFiles % 10 === 0 || processedFiles === files.length) {
                console.log(`Progress: ${processedFiles}/${files.length} files processed (${Math.round(processedFiles/files.length*100)}%)`);
            }
            
            if (result.hasIssues) {
                filesWithIssues++;
                console.log(`\nIssues found in ${result.fileKey}:`);
                result.issues.forEach(issue => console.log(`- ${issue}`));
                if (result.wasFixed) {
                    filesFixed++;
                }
            }
        }
        
        console.log(`\nValidation complete.`);
        console.log(`Files with issues: ${filesWithIssues}`);
        console.log(`Files automatically fixed: ${filesFixed}`);
        console.log(`Files without issues: ${files.length - filesWithIssues}`);
        
    } catch (error) {
        console.error('Validation failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
} 