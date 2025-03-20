const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
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

// Helper function to stream S3 data to string
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

async function fetchVoteFile(key) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key
        });
        const response = await s3.send(command);
        return await streamToString(response.Body);
    } catch (error) {
        console.error(`Error fetching file ${key}:`, error);
        return null;
    }
}

async function mergeVotes() {
    try {
        console.log('Starting vote data merge...');
        
        // Create output file with headers
        const headers = 'time,ip,poll_,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,' +
                       'is_cloud_provider,closest_region,latency_ms,roundtrip_ms,' +
                       'captcha_verified,phone_number,user_id\n';
        fs.writeFileSync('data/all_votes.csv', headers);

        let continuationToken;
        let totalFiles = 0;
        let totalVotes = 0;

        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: VOTES_PREFIX,
                ContinuationToken: continuationToken
            });

            const response = await s3.send(command);
            
            // Process each votes.csv file
            for (const object of response.Contents || []) {
                if (object.Key.endsWith('votes.csv')) {
                    const data = await fetchVoteFile(object.Key);
                    if (data) {
                        // Skip header row and empty lines
                        const lines = data.split('\n')
                            .slice(1)
                            .filter(line => line.trim());
                        
                        if (lines.length > 0) {
                            fs.appendFileSync('data/all_votes.csv', lines.join('\n') + '\n');
                            totalVotes += lines.length;
                            totalFiles++;
                            
                            if (totalFiles % 100 === 0) {
                                console.log(`Processed ${totalFiles} files, ${totalVotes} votes so far...`);
                            }
                        }
                    }
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`Merge complete! Processed ${totalFiles} files with ${totalVotes} total votes`);
        console.log('Output saved to data/all_votes.csv');

    } catch (error) {
        console.error('Error merging votes:', error);
    }
}

// Run the script
mergeVotes(); 