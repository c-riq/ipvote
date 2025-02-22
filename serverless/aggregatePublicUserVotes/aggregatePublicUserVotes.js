const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const PROFILES_BUCKET = 'ipvotes';

async function listAllS3Files(bucket, prefix) {
    const files = [];
    let continuationToken = undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken
        });
        const response = await s3Client.send(command);
        if (response.Contents) {
            files.push(...response.Contents.map(file => file.Key));
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
}

async function fetchFileFromS3(bucket, key) {
    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return data;
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return null;
        }
        throw error;
    }
}

async function updatePublicProfile(userId, votes) {
    try {
        // Fetch existing profile
        const profileKey = `public_profiles/${userId}.json`;
        const existingData = await fetchFileFromS3(PROFILES_BUCKET, profileKey);
        const profile = existingData ? JSON.parse(existingData) : { settings: {} };

        // Update votes while preserving other fields
        profile.votes = votes;

        // Save updated profile
        const command = new PutObjectCommand({
            Bucket: PROFILES_BUCKET,
            Key: profileKey,
            Body: JSON.stringify(profile, null, 2),
            ContentType: 'application/json'
        });
        await s3Client.send(command);
    } catch (error) {
        console.error(`Error updating profile for user ${userId}:`, error);
        throw error;
    }
}

exports.handler = async (event) => {
    try {
        // Get all vote files
        const voteFiles = await listAllS3Files(PROFILES_BUCKET, 'votes/poll=');
        
        // Map to store votes by user ID
        const userVotes = new Map();

        // Process each vote file
        for (const file of voteFiles) {
            const data = await fetchFileFromS3(PROFILES_BUCKET, file);
            if (!data) continue;

            const lines = data.split('\n');
            const headers = lines[0].split(',');
            const userIdIndex = headers.indexOf('user_id');
            const pollIndex = headers.indexOf('poll_');
            const voteIndex = headers.indexOf('vote');
            const timeIndex = headers.indexOf('time');

            // Skip if required columns are not found
            if (userIdIndex === -1 || pollIndex === -1 || voteIndex === -1 || timeIndex === -1) {
                console.warn(`Required columns not found in file: ${file}`);
                continue;
            }

            // Process each vote
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const columns = line.split(',');
                const userId = columns[userIdIndex];
                
                // Skip votes without user ID
                if (!userId) continue;

                // Initialize user's votes array if not exists
                if (!userVotes.has(userId)) {
                    userVotes.set(userId, []);
                }

                // Add vote to user's array
                userVotes.get(userId).push({
                    timestamp: parseInt(columns[timeIndex]),
                    poll: columns[pollIndex],
                    vote: columns[voteIndex]
                });
            }
        }

        // Update public profiles for each user
        const updatePromises = [];
        for (const [userId, votes] of userVotes.entries()) {
            // Sort votes by timestamp (newest first)
            votes.sort((a, b) => b.timestamp - a.timestamp);
            
            updatePromises.push(updatePublicProfile(userId, votes));
        }

        await Promise.all(updatePromises);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Successfully updated votes for ${userVotes.size} users`,
                time: new Date()
            })
        };
    } catch (error) {
        console.error('Error aggregating user votes:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error aggregating user votes',
                error: error.message,
                time: new Date()
            })
        };
    }
}; 