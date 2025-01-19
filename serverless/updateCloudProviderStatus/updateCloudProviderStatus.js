const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes-test';

function ipToInt(ip) {
    return ip.split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function ipv6ToBytes(ip) {
    // Remove any compressed notation and convert to full form
    const fullAddress = ip.split('::').map(part => {
        const segments = part.split(':');
        return segments.concat(Array(8 - segments.length).fill('0')).slice(0, 8);
    }).join(':');
    
    // Convert each 16-bit group to bytes
    return fullAddress.split(':')
        .map(group => parseInt(group || '0', 16))
        .reduce((acc, val) => {
            acc.push((val >> 8) & 0xff);
            acc.push(val & 0xff);
            return acc;
        }, []);
}

function isIPInRange(ip, cidr) {
    // Handle IPv4 and IPv6 separately
    const isIPv6 = ip.includes(':');
    const isCIDRv6 = cidr.includes(':');
    
    // Skip if IP and CIDR versions don't match
    if (isIPv6 !== isCIDRv6) return false;
    
    if (isIPv6) {
        const [rangeIP, bits] = cidr.split('/');
        const prefixLength = parseInt(bits);
        
        // Convert both IPs to byte arrays
        const ipBytes = ipv6ToBytes(ip);
        const rangeBytes = ipv6ToBytes(rangeIP);
        
        // Compare bytes up to the prefix length
        const fullBytes = Math.floor(prefixLength / 8);
        for (let i = 0; i < fullBytes; i++) {
            if (ipBytes[i] !== rangeBytes[i]) return false;
        }
        
        // Check remaining bits if any
        const remainingBits = prefixLength % 8;
        if (remainingBits > 0) {
            const mask = 0xff << (8 - remainingBits);
            const lastByteIndex = fullBytes;
            if ((ipBytes[lastByteIndex] & mask) !== (rangeBytes[lastByteIndex] & mask)) {
                return false;
            }
        }
        
        return true;
    } else {
        // Existing IPv4 logic
        const [rangeIP, bits] = cidr.split('/');
        const mask = ~((1 << (32 - parseInt(bits))) - 1);
        const ipInt = ipToInt(ip);
        const rangeInt = ipToInt(rangeIP);
        return (ipInt & mask) === (rangeInt & mask);
    }
}

async function fetchCloudProviderRanges() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const csvPath = path.join(__dirname, 'combined-ip-ranges.csv');
        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        // Skip header line and parse the rest
        const ranges = lines.slice(1).map(line => {
            const [ip_prefix, cloud_provider, tag] = line.split(',');
            return { ip_prefix, cloud_provider, tag };
        });

        return ranges;
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

async function updateFile(fileKey, cloudProviderRanges) {
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
        const cloudProviderIndex = currentColumns.indexOf('is_cloud_provider');
        
        if (cloudProviderIndex === -1) {
            console.error(`Skipping ${fileKey}: Missing 'is_cloud_provider' column in header`);
            return false;
        }

        let processedRows = 0;
        let updatedRows = 0;

        // Update each data row
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const columns = lines[i].split(',');
            const ip = columns[1]; // IP is always the second column
            
            // Find matching cloud provider
            let matchingProvider = null;
            for (const range of cloudProviderRanges) {
                if (isIPInRange(ip, range.ip_prefix)) {
                    matchingProvider = `${range.cloud_provider}:${range.tag}`;
                    break;
                }
            }
            
            const currentProvider = columns[cloudProviderIndex];
            const newProvider = matchingProvider || '';
            
            if (currentProvider !== newProvider) {
                columns[cloudProviderIndex] = newProvider;
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
        console.log('Starting cloud provider status update...');
        
        // Fetch cloud provider ranges
        const cloudProviderRanges = await fetchCloudProviderRanges();
        console.log(`Fetched ${cloudProviderRanges.length} cloud provider ranges`);
        
        // Get all vote files
        const files = await listAllVoteFiles();
        console.log(`Found ${files.length} files to process`);

        // Update each file
        let updatedCount = 0;
        for (const file of files) {
            const wasUpdated = await updateFile(file.Key, cloudProviderRanges);
            if (wasUpdated) updatedCount++;
        }

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