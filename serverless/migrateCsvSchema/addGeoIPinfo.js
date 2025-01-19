const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
require("@aws-sdk/crc64-nvme-crt");

/* old format including user selected country, which is different from GeoIP country:
time,ip,poll_,vote,country,nonce
1736898521304,35.1.97.1,a_or_b,a,,
1737208054385,37.2.220.21,a_or_b,b,undefined,undefined
*/

const { getIPInfo } = require('./from_ipInfos/ipCountryLookup');

const s3Client = new S3Client({
//    checksumValidation: false
});
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
        if (headerLine.includes('country_geoip') && headerLine.includes('asn_name_geoip')) {
            console.log(`File ${fileKey} already has GeoIP columns`);
            return false;
        }

        // Update header
        const currentColumns = headerLine.split(',');
        if (!headerLine.includes('country_geoip')) {
            currentColumns.push('country_geoip');
        }
        if (!headerLine.includes('asn_name_geoip')) {
            currentColumns.push('asn_name_geoip');
        }
        lines[0] = currentColumns.join(',');

        // Add GeoIP info to all data rows
        let processedRows = 0;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const columns = lines[i].split(',');
                const ip = columns[1]; // Assuming IP is always the second column
                const ipInfo = getIPInfo(ip);
                
                // Add country and ASN info, preserving existing data if present
                const countryIndex = currentColumns.indexOf('country_geoip');
                const asnIndex = currentColumns.indexOf('asn_name_geoip');
                
                if (countryIndex >= 0) {
                    columns[countryIndex] = ipInfo?.country || 'XX';
                } else {
                    columns.push(ipInfo?.country || 'XX');
                }
                
                if (asnIndex >= 0) {
                    columns[asnIndex] = ipInfo?.as_name || '';
                } else {
                    columns.push(ipInfo?.as_name || '');
                }
                
                lines[i] = columns.join(',');
                processedRows++;
                
                // Log progress every 100 rows
                if (processedRows % 100 === 0) {
                    console.log(`Processed ${processedRows} rows in ${fileKey}`);
                }
            }
        }

        // Write back to S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: lines.join('\n'),
        });
        await s3Client.send(command);
        console.log(`Successfully migrated ${fileKey} (${processedRows} rows)`);
        return true;
    } catch (error) {
        console.error(`Error migrating file ${fileKey}:`, error);
        throw error;
    }
};

// Main execution function
async function main() {
    try {
        console.log('Starting GeoIP info addition...');
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Migrate each file
        let migratedCount = 0;
        for (const file of files) {
            const wasMigrated = await migrateFile(file.Key);
            if (wasMigrated) migratedCount++;
        }

        console.log(`Migration complete. Added GeoIP info to ${migratedCount} of ${files.length} files.`);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run if called directly (not imported as a module)
if (require.main === module) {
    main().catch(console.error);
} 