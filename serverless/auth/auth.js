const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvote-auth';
const SALT_ROUNDS = 12;

// Helper function to fetch file from S3
const fetchFileFromS3 = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return JSON.parse(data);
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return {};
        }
        throw error;
    }
};

// Helper function to save file to S3
const saveFileToS3 = async (key, data) => {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json'
    });
    return s3Client.send(command);
};

// Generate a secure session token with expiry (31 days from now)
const generateSessionToken = () => {
    const expiryTime = Math.floor(Date.now() / 1000) + (31 * 24 * 60 * 60); // 31 days from now
    return `${crypto.randomBytes(32).toString('hex')}_${expiryTime}`;
};

exports.handler = async (event) => {
    const { action, email, password, sessionToken } = JSON.parse(event.body);
    
    if (!action) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing required fields',
                time: new Date()
            })
        };
    }

    // Special handling for verifySessionToken action
    if (action === 'verifySessionToken') {
        if (!email || !sessionToken) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing email or session token',
                    time: new Date()
                })
            };
        }

        // Get partition key from first letter of email
        const partition = email.charAt(0).toLowerCase();
        const userFilePath = `users/${partition}/users.json`;

        try {
            const users = await fetchFileFromS3(userFilePath);
            const user = users[email];

            if (!user || !user.sessions) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: 'Invalid session',
                        time: new Date()
                    })
                };
            }

            // Check if token exists and is not expired
            const currentTime = Math.floor(Date.now() / 1000);
            const isValidToken = user.sessions.some(token => {
                const [tokenValue, expiry] = token.split('_');
                return token === sessionToken && parseInt(expiry) > currentTime;
            });

            if (!isValidToken) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: 'Invalid or expired session',
                        time: new Date()
                    })
                };
            }

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Session valid',
                    time: new Date()
                })
            };
        } catch (error) {
            console.error('Session verification error:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Internal server error',
                    time: new Date()
                })
            };
        }
    }

    // Original email/password validation for login/signup
    if (!email || !password) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing required fields',
                time: new Date()
            })
        };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid email format',
                time: new Date()
            })
        };
    }

    // Get partition key from first letter of email
    const partition = email.charAt(0).toLowerCase();
    const userFilePath = `users/${partition}/users.json`;

    try {
        const users = await fetchFileFromS3(userFilePath);

        if (action === 'signup') {
            // Check if user already exists
            if (users[email]) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({
                        message: 'Email already registered',
                        time: new Date()
                    })
                };
            }

            // Hash password with salt
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            const sessionToken = generateSessionToken();

            // Store new user with sessions array
            users[email] = {
                hashedPassword,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                sessions: [sessionToken]  // Initialize as array with first token
            };

            await saveFileToS3(userFilePath, users);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'User registered successfully',
                    sessionToken,
                    time: new Date()
                })
            };

        } else if (action === 'login') {
            const user = users[email];
            
            if (!user) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: 'Invalid credentials',
                        time: new Date()
                    })
                };
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
            
            if (!passwordMatch) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: 'Invalid credentials',
                        time: new Date()
                    })
                };
            }

            // Generate new session token
            const sessionToken = generateSessionToken();
            
            // Initialize sessions array if it doesn't exist (for existing users)
            if (!users[email].sessions) {
                users[email].sessions = [];
            }
            
            // Clean up expired sessions
            const currentTime = Math.floor(Date.now() / 1000);
            users[email].sessions = users[email].sessions.filter(token => {
                const [, expiry] = token.split('_');
                return parseInt(expiry) > currentTime;
            });
            
            // Add new session token
            users[email].sessions.push(sessionToken);
            users[email].lastLogin = new Date().toISOString();

            await saveFileToS3(userFilePath, users);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Login successful',
                    sessionToken,
                    time: new Date()
                })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid action',
                time: new Date()
            })
        };

    } catch (error) {
        console.error('Authentication error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                time: new Date()
            })
        };
    }
}; 