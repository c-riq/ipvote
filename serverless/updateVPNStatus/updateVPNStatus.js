const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';

function ipToInt(ip) {
    return ip.split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isIPInRange(ip, cidr) {
    const [rangeIP, bits] = cidr.split('/');
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(rangeIP);
    return (ipInt & mask) === (rangeInt & mask);
}

async function fetchVPNRanges() {
    try {
        const fs = require('fs');
        const path = require('path');
        const data = fs.readFileSync(path.join(__dirname, './data/vpn-ranges.csv'), 'utf8');
        return data.split('\n')
            .filter(line => line.trim())
            .map(line => line.split(',')[0].trim());
    } catch (error) {
        console.error('Failed to fetch VPN ranges:', error);
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

async function updateFile(fileKey, vpnRanges) {
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
        const isVpnIndex = currentColumns.indexOf('is_vpn');
        
        if (isVpnIndex === -1) {
            console.error(`Skipping ${fileKey}: Missing 'is_vpn' column in header`);
            return false;
        }

        let processedRows = 0;
        let updatedRows = 0;

        // Update each data row
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const columns = lines[i].split(',');
            const ip = columns[1]; // IP is always the second column
            
            // Skip IPv6 addresses for now
            if (ip.includes(':')) continue;
            
            const currentVpnStatus = columns[isVpnIndex];
            const isVpn = vpnRanges.some(range => isIPInRange(ip, range));
            const newVpnStatus = isVpn ? '1' : '0';
            
            if (currentVpnStatus !== newVpnStatus) {
                columns[isVpnIndex] = newVpnStatus;
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
        console.log('Starting VPN status update...');
        
        // Fetch VPN ranges
        const vpnRanges = await fetchVPNRanges();
        console.log(`Fetched ${vpnRanges.length} VPN ranges`);
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Update each file
        let updatedCount = 0;
        for (const file of files) {
            const wasUpdated = await updateFile(file.Key, vpnRanges);
            if (wasUpdated) updatedCount++;
        }

        console.log(`Update complete. Updated VPN status in ${updatedCount} of ${files.length} files.`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Successfully updated VPN status in ${updatedCount} files`,
                filesProcessed: files.length
            })
        };
    } catch (error) {
        console.error('Update failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to update VPN status',
                message: error.message
            })
        };
    }
}; 