const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = new S3Client();

const fetchFileFromS3 = async (bucketName, key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        const response = await s3Client.send(command);
        const fileContents = await response.Body.transformToString();
        return fileContents;
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return null;
        }
        throw error;
    }
};

const validatePhoneToken = async (phoneNumber, token, bucketName) => {
    const fileName = 'phone_number/verification.csv';
    const monthInMs = 31 * 24 * 60 * 60 * 1000;
    
    try {
        const data = await fetchFileFromS3(bucketName, fileName);
        const lines = data.split('\n');
        
        for (let i = 1; i < lines.length; i++) {
            const [timestamp, storedPhone, storedToken] = lines[i].split(',');
            if (!storedPhone || !storedToken || !timestamp) continue;
            
            if (storedPhone === phoneNumber && storedToken === token) {
                const verificationTime = parseInt(timestamp);
                const now = Date.now();
                if (now - verificationTime < monthInMs) {
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error validating phone token:', error);
    }
    return false;
};

const sanitizeInput = (str) => {
    if (!str) return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

const VALID_TAGS = ['global', 'approval rating', 'national', 'other'];

const maskIP = (ip) => {
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
};


function maskPhoneNumber(phone) {
    if (!phone) return '';
    // Keep country code and first digits, mask the last 6 digits
    // Example: +491234567890 -> +491234XXXXXX
    return phone.replace(/(\+\d+)(\d{6})$/, '$1XXXXXX');
}

module.exports.handler = async (event) => {
    // Handle GET request to fetch metadata
    if (event.requestContext?.http?.method === 'GET' && event.queryStringParameters?.poll) {
        const poll = event.queryStringParameters.poll;
        const metadataPath = `metadata/poll=${poll}/metadata.json`;
        const bucketName = 'ipvotes';

        try {
            const metadata = await fetchFileFromS3(bucketName, metadataPath);
            if (!metadata) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({
                        message: 'No metadata found for this poll',
                        time: new Date()
                    }),
                };
            }

            return {
                statusCode: 200,
                body: metadata
            };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Failed to fetch metadata',
                    time: new Date()
                }),
            };
        }
    }

    // Parse POST body
    let requestData;
    try {
        requestData = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid JSON body',
                time: new Date()
            }),
        };
    }

    // Get data from request body instead of query parameters
    const poll = requestData.poll;
    const phoneNumber = requestData.phoneNumber;
    const phoneToken = requestData.phoneToken;
    const comment = sanitizeInput(requestData.comment);
    const tag = sanitizeInput(requestData.tag);
    const parentId = requestData.parentId;
    
    // Validate inputs
    if (!poll || (!comment && !tag)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing required parameters',
                time: new Date()
            }),
        };
    }

    // Validate comment length
    if (comment && comment.length > 1000) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Comment exceeds maximum length of 1000 characters',
                time: new Date()
            }),
        };
    }

    // Validate tag if present
    if (tag && !VALID_TAGS.includes(tag.toLowerCase())) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid tag. Must be one of: ' + VALID_TAGS.join(', '),
                time: new Date()
            }),
        };
    }

    // Create userId from phone verification or redacted IP
    let userId;
    let isPhoneVerified = false;
    
    if (phoneNumber && phoneToken) {
        isPhoneVerified = await validatePhoneToken(phoneNumber, phoneToken, 'ipvotes');
        if (isPhoneVerified) {
            userId = `${maskPhoneNumber(phoneNumber)}_${phoneToken.slice(0, 3)}`;
        }
    }
    
    if (!isPhoneVerified) {
        if (tag) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    message: 'Phone verification required for adding tags',
                    time: new Date()
                }),
            };
        }
        userId = `${maskIP(event.requestContext.http.sourceIp)}`;
    }

    const metadataPath = `metadata/poll=${poll}/metadata.json`;
    const bucketName = 'ipvotes';

    try {
        // Fetch existing metadata or create new
        let metadata = await fetchFileFromS3(bucketName, metadataPath);
        let metadataObj = metadata ? JSON.parse(metadata) : {
            comments: [],
            tags: [],
            lastUpdated: Date.now()
        };

        // Check existing user submissions with adjusted limits
        const userComments = metadataObj.comments.filter(c => c.userId === userId).length;
        const userTags = metadataObj.tags.filter(t => t.userId === userId).length;

        // Validate submission limits
        if (comment) {
            const maxComments = isPhoneVerified ? 20 : 1;
            if (userComments >= maxComments) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: isPhoneVerified ? 
                            'Maximum comment limit reached (20 comments per verified user)' :
                            'Maximum comment limit reached (1 comment per unverified user)',
                        time: new Date()
                    }),
                };
            }
        }
        if (tag && userTags >= 1) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Maximum tag limit reached (1 tag per user)',
                    time: new Date()
                }),
            };
        }

        // Add new metadata
        if (comment) {
            const timestamp = Date.now();
            const commentId = `${userId}_${timestamp}`;
            
            metadataObj.comments.push({
                comment: comment,
                userId: userId,
                timestamp: timestamp,
                id: commentId,
                ...(parentId && { parentId })
            });
        }
        if (tag) {
            metadataObj.tags.push({
                tag: tag,
                userId: userId,
                timestamp: Date.now()
            });
        }
        metadataObj.lastUpdated = Date.now();

        // Save updated metadata
        const putParams = {
            Bucket: bucketName,
            Key: metadataPath,
            Body: JSON.stringify(metadataObj, null, 2),
            ContentType: 'application/json'
        };

        await s3Client.send(new PutObjectCommand(putParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Metadata updated successfully',
                time: new Date()
            }),
        };

    } catch (error) {
        console.error('Error updating metadata:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to update metadata',
                time: new Date()
            }),
        };
    }
}; 
