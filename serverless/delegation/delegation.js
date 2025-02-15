const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';
const AUTH_BUCKET = 'ipvote-auth';

// Helper function to fetch file from S3
const fetchFileFromS3 = async (bucket, key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return data;
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return 'source,target,category,time\n';
        }
        throw error;
    }
};

// Helper function to save file to S3
const saveFileToS3 = async (bucket, key, data) => {
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: 'text/csv'
    });
    return s3Client.send(command);
};

// Helper function to verify session
const verifySession = async (email, sessionToken) => {
    try {
        const partition = email.charAt(0).toLowerCase();
        const userFilePath = `users/${partition}/users.json`;
        
        const usersStr = await fetchFileFromS3(AUTH_BUCKET, userFilePath);
        const users = JSON.parse(usersStr);
        const user = users[email];

        if (!user || !user.sessions) {
            return null;
        }

        const currentTime = Math.floor(Date.now() / 1000);
        const isValidToken = user.sessions.some(token => {
            const [tokenValue, expiry] = token.split('_');
            return token === sessionToken && parseInt(expiry) > currentTime;
        });

        if (!isValidToken) {
            return null;
        }

        return user;
    } catch (error) {
        console.error('Session verification error:', error);
        return null;
    }
};

// Helper function to verify target user exists and is a politician
const verifyTargetUser = async (targetId) => {
    try {
        const publicProfilePath = `public_profiles/${targetId}.json`;
        const publicProfile = JSON.parse(await fetchFileFromS3(BUCKET_NAME, publicProfilePath));

        if (!publicProfile || !publicProfile.settings?.isPolitician) {
            return null;
        }

        return publicProfile;
    } catch (error) {
        console.error('Target user verification error:', error);
        return null;
    }
};

exports.handler = async (event) => {
    // Parse request body
    const { action, email, sessionToken, target, category, source } = JSON.parse(event.body || '{}');

    // Validate input
    if (!email || !sessionToken || !action) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing required fields',
                time: new Date()
            })
        };
    }

    // Verify session
    const sourceUser = await verifySession(email, sessionToken);
    if (!sourceUser) {
        return {
            statusCode: 401,
            body: JSON.stringify({
                message: 'Invalid session',
                time: new Date()
            })
        };
    }

    // Get delegation file path
    const delegationPath = `delegation/${source.slice(0, 2)}/delegation.csv`;

    switch (action) {
        case 'delegate': {
            // Additional validation for delegation
            if (!target || !category || !source) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing target or category',
                        time: new Date()
                    })
                };
            }

            if(sourceUser.userId !== source) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Invalid source user: ' + sourceUser.userId + ' != ' + source,
                        time: new Date()
                    })
                };
            }

            // Validate category format (no commas or newlines)
            if (category.match(/[,\n\r]/)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Invalid category format',
                        time: new Date()
                    })
                };
            }

            // Verify target user
            const targetUser = await verifyTargetUser(target);
            if (!targetUser) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Invalid target user or user is not a politician',
                        time: new Date()
                    })
                };
            }

            // Read existing delegations
            const data = await fetchFileFromS3(BUCKET_NAME, delegationPath);
            const lines = data.split('\n');
            const newLines = lines.filter(line => {
                const [src, , cat] = line.split(',');
                return !(src === source && cat === category);
            });

            // Add new delegation
            const timestamp = Date.now();
            newLines.push(`${source},${target},${category},${timestamp}`);

            // Save updated delegations
            await saveFileToS3(BUCKET_NAME, delegationPath, newLines.join('\n') + '\n');

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Delegation successful',
                    time: new Date()
                })
            };
        }

        case 'revoke': {
            // Additional validation for revocation
            if (!category) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing category',
                        time: new Date()
                    })
                };
            }

            // Read existing delegations
            const data = await fetchFileFromS3(BUCKET_NAME, delegationPath);
            const lines = data.split('\n');
            const newLines = lines.filter(line => {
                const [src, , cat] = line.split(',');
                return !(src === source && cat === category);
            });

            // Save updated delegations
            await saveFileToS3(BUCKET_NAME, delegationPath, newLines.join('\n') + '\n');

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Delegation revoked',
                    time: new Date()
                })
            };
        }

        case 'list': {
            // Read existing delegations
            const data = await fetchFileFromS3(BUCKET_NAME, delegationPath);
            const lines = data.split('\n');
            const delegations = lines
                .filter(line => line.startsWith(source + ','))
                .map(line => {
                    const [, target, category, timestamp] = line.split(',');
                    return { target, category, timestamp: parseInt(timestamp) };
                });

            return {
                statusCode: 200,
                body: JSON.stringify({
                    delegations,
                    time: new Date()
                })
            };
        }

        default:
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid action',
                    time: new Date()
                })
            };
    }
};
