const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const RECENT_VOTES_FILE = 'recent_votes/all_polls.json';
const MAX_VOTES = 100;

const fetchRecentVotes = async (bucketName) => {
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: RECENT_VOTES_FILE
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return JSON.parse(data);
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return { votes: [] };
        }
        throw error;
    }
};

function maskIP(ip) {
    try {
        if (ip.includes('.')) {
            // IPv4
            const parts = ip.split('.');
            const thirdOctet = parts[2] || '';
            const paddedThird = thirdOctet.padStart(3, '0');
            const maskedThird = paddedThird.substring(0, 2) + 'X';
            return `${parts[0]}.${parts[1]}.${maskedThird}.XXX`;
        } else {
            // IPv6
            const parts = ip.split(':');
            const thirdOctet = parts[2] || '';
            const paddedThird = thirdOctet.padStart(4, '0');
            const maskedThird = paddedThird.substring(0, 1) + 'XXX';
            return `${parts[0]}:${parts[1]}:${maskedThird}:XXXX:XXXX:XXXX`;
        }
    } catch (error) {
        console.error('Error in maskIP:', error, 'IP:', ip);
        throw error;
    }
}

module.exports.handler = async (event) => {
    const { poll, vote, timestamp, ip, country } = event;
    const bucketName = 'ipvotes';

    try {
        // Fetch current recent votes
        const recentVotes = await fetchRecentVotes(bucketName);

        // Add new vote to the beginning of the array
        recentVotes.votes.unshift({
            poll,
            vote,
            timestamp,
            ip: maskIP(ip),
            country
        });

        // Keep only the most recent 100 votes
        if (recentVotes.votes.length > MAX_VOTES) {
            recentVotes.votes = recentVotes.votes.slice(0, MAX_VOTES);
        }

        // Save updated recent votes
        const putCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: RECENT_VOTES_FILE,
            Body: JSON.stringify(recentVotes, null, 2),
            ContentType: 'application/json'
        });
        await s3Client.send(putCommand);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Recent votes updated successfully'
            })
        };
    } catch (error) {
        console.error('Error updating recent votes:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to update recent votes'
            })
        };
    }
}; 