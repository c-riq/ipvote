const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const s3Client = new S3Client();
const sesClient = new SESClient();
const BUCKET_NAME = 'ipvote-auth';
const SALT_ROUNDS = 12;

const HOST = 'https://4muvzwnbeezy7vgogyx2z75uaq0lctto.lambda-url.us-east-1.on.aws'
const SES_SENDER = 'info@rixdata.net'

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

// Add helper function to generate user ID (near other helper functions)
const generateUserId = () => {
    // Generate 16 random bytes and convert to hex for a 32-character string
    return crypto.randomBytes(16).toString('hex');
};

// Add new helper function to send verification email
const sendVerificationEmail = async (email, verificationToken) => {
    const verificationLink = `${HOST}/verify?email=${encodeURIComponent(email)}&token=${verificationToken}`;
    
    const params = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: {
                    Data: `Please verify your email by clicking this link: ${verificationLink}`
                }
            },
            Subject: {
                Data: "Verify your email address"
            }
        },
        Source: SES_SENDER
    };

    const command = new SendEmailCommand(params);
    return sesClient.send(command);
};

exports.handler = async (event) => {
    // For verification action, we'll check query parameters instead of body
    if (event.queryStringParameters && event.queryStringParameters.email && event.queryStringParameters.token) {
        const { email, token } = event.queryStringParameters;
        
        try {
            // Get partition key from first letter of email
            const partition = email.charAt(0).toLowerCase();
            const userFilePath = `users/${partition}/users.json`;

            const users = await fetchFileFromS3(userFilePath);
            const user = users[email];

            if (!user) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'text/html'
                    },
                    body: '<h1>User not found</h1><p>The verification link is invalid or has expired.</p>'
                };
            }

            if (user.emailVerified) {
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'text/html'
                    },
                    body: '<h1>Already Verified</h1><p>Your email has already been verified. You can now log in to your account.</p>'
                };
            }

            if (user.emailVerificationToken !== token) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'text/html'
                    },
                    body: '<h1>Invalid Token</h1><p>The verification link is invalid or has expired.</p>'
                };
            }

            // Update user verification status
            users[email].emailVerified = true;
            users[email].emailVerificationToken = null; // Clear the verification token
            await saveFileToS3(userFilePath, users);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html'
                },
                body: '<h1>Email Verified</h1><p>Your email has been successfully verified. You can now log in to your account.</p>'
            };

        } catch (error) {
            console.error('Verification error:', error);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'text/html'
                },
                body: '<h1>Error</h1><p>An error occurred during verification. Please try again later.</p>'
            };
        }
    }

    // Existing body parsing for other actions
    const { action, email, password, sessionToken } = JSON.parse(event.body || '{}');
    
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
                    emailVerified: user.emailVerified,
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

            // Generate verification token and user ID
            const emailVerificationToken = crypto.randomBytes(32).toString('hex');
            const userId = generateUserId();
            
            // Hash password with salt
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            const sessionToken = generateSessionToken();

            // Store new user with verification status and user ID
            users[email] = {
                userId,
                hashedPassword,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                sessions: [sessionToken],
                emailVerified: false,
                emailVerificationToken
            };

            try {
                // First try to send the verification email
                await sendVerificationEmail(email, emailVerificationToken);
                
                // Only save the user to S3 if email sends successfully
                await saveFileToS3(userFilePath, users);

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: 'User registered successfully. Please check your email to verify your account.',
                        sessionToken,
                        time: new Date()
                    })
                };
            } catch (error) {
                console.error('Error sending verification email:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        message: 'Failed to send verification email. Please try signing up again.',
                        error: error.message,
                        time: new Date()
                    })
                };
            }

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

            // Check if email is verified
            if (!user.emailVerified) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({
                        message: 'Please verify your email before logging in',
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