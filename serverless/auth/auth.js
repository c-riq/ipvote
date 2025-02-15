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

// Add new constant for the public profiles bucket
const PROFILES_BUCKET = 'ipvotes';

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

// Add helper function to manage public profiles
const savePublicProfile = async (userId, settings) => {
    const command = new PutObjectCommand({
        Bucket: PROFILES_BUCKET,
        Key: `public_profiles/${userId}.json`,
        Body: JSON.stringify({
            settings: {
                isPolitician: false,
                firstName: '',
                lastName: '',
                country: '',
                xUsername: '',
                linkedinUrl: '',
                websiteUrl: '',
                ...settings
            }
        }, null, 2),
        ContentType: 'application/json'
    });
    return s3Client.send(command);
};

const getPublicProfile = async (userId) => {
    try {
        const command = new GetObjectCommand({
            Bucket: PROFILES_BUCKET,
            Key: `public_profiles/${userId}.json`,
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return JSON.parse(data);
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return { settings: {} };
        }
        throw error;
    }
};

const handleVerification = async (email, token) => {
    try {
        const partition = email.charAt(0).toLowerCase();
        const userFilePath = `users/${partition}/users.json`;

        const users = await fetchFileFromS3(userFilePath);
        const user = users[email];

        if (!user) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'text/html' },
                body: '<h1>User not found</h1><p>The verification link is invalid or has expired.</p>'
            };
        }

        if (user.emailVerified) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: '<h1>Already Verified</h1><p>Your email has already been verified. You can now log in to your account.</p>'
            };
        }

        if (user.emailVerificationToken !== token) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'text/html' },
                body: '<h1>Invalid Token</h1><p>The verification link is invalid or has expired.</p>'
            };
        }

        users[email].emailVerified = true;
        users[email].emailVerificationToken = null;
        await saveFileToS3(userFilePath, users);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: '<h1>Email Verified</h1><p>Your email has been successfully verified. You can now log in to your account.</p>'
        };
    } catch (error) {
        console.error('Verification error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/html' },
            body: '<h1>Error</h1><p>An error occurred during verification. Please try again later.</p>'
        };
    }
};

const handleSessionVerification = async (email, sessionToken) => {
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

        // Fetch settings from public profile
        const publicProfile = await getPublicProfile(user.userId);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Session valid',
                emailVerified: user.emailVerified,
                settings: publicProfile.settings || { isPolitician: false },
                userId: user.userId,
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
};

const handleLogin = async (email, password) => {
    const partition = email.charAt(0).toLowerCase();
    const userFilePath = `users/${partition}/users.json`;

    try {
        const users = await fetchFileFromS3(userFilePath);
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

        if (!user.emailVerified) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    message: 'Please verify your email before logging in',
                    time: new Date()
                })
            };
        }

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

        const sessionToken = generateSessionToken();
        
        if (!users[email].sessions) {
            users[email].sessions = [];
        }
        
        const currentTime = Math.floor(Date.now() / 1000);
        users[email].sessions = users[email].sessions.filter(token => {
            const [, expiry] = token.split('_');
            return parseInt(expiry) > currentTime;
        });
        
        users[email].sessions.push(sessionToken);
        users[email].lastLogin = new Date().toISOString();

        await saveFileToS3(userFilePath, users);

        // Fetch user settings from public profile
        const publicProfile = await getPublicProfile(user.userId);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Login successful',
                sessionToken,
                settings: publicProfile.settings || { isPolitician: false },
                time: new Date()
            })
        };
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                time: new Date()
            })
        };
    }
};

const handleSignup = async (email, password) => {
    const partition = email.charAt(0).toLowerCase();
    const userFilePath = `users/${partition}/users.json`;

    try {
        const users = await fetchFileFromS3(userFilePath);

        if (users[email]) {
            return {
                statusCode: 409,
                body: JSON.stringify({
                    message: 'Email already registered',
                    time: new Date()
                })
            };
        }

        const emailVerificationToken = crypto.randomBytes(32).toString('hex');
        const userId = generateUserId();
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const sessionToken = generateSessionToken();

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
            await sendVerificationEmail(email, emailVerificationToken);
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
    } catch (error) {
        console.error('Signup error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                time: new Date()
            })
        };
    }
};

const handleUpdateSettings = async (email, sessionToken, settings) => {
    const partition = email.charAt(0).toLowerCase();
    const userFilePath = `users/${partition}/users.json`;

    try {
        const users = await fetchFileFromS3(userFilePath);
        const user = users[email];

        const currentTime = Math.floor(Date.now() / 1000);
        const isValidToken = user?.sessions?.some(token => {
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

        // Validate the settings
        if (typeof settings.isPolitician !== 'boolean') {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid settings format: isPolitician must be a boolean',
                    time: new Date()
                })
            };
        }

        // Get existing public profile
        const publicProfile = await getPublicProfile(user.userId);
        
        // Update settings with new fields and timestamp
        const updatedSettings = {
            ...publicProfile.settings,
            ...settings,
            lastUpdated: new Date().toISOString()
        };

        // Save to public profile
        await savePublicProfile(user.userId, updatedSettings);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Settings updated successfully',
                settings: updatedSettings,
                time: new Date()
            })
        };
    } catch (error) {
        console.error('Settings update error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                time: new Date()
            })
        };
    }
};

exports.handler = async (event) => {
    // Handle email verification via query parameters
    if (event.queryStringParameters?.email && event.queryStringParameters?.token) {
        return handleVerification(event.queryStringParameters.email, event.queryStringParameters.token);
    }

    // Parse request body for other actions
    const { action, email, password, sessionToken, settings } = JSON.parse(event.body || '{}');

    if (!action) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing required fields',
                time: new Date()
            })
        };
    }

    // Email format validation for actions that require it
    if (['login', 'signup', 'verifySessionToken', 'updateSettings'].includes(action)) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid email format',
                    time: new Date()
                })
            };
        }
    }

    // Handle different actions
    switch (action) {
        case 'verifySessionToken':
            if (!email || !sessionToken) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing email or session token',
                        time: new Date()
                    })
                };
            }
            return handleSessionVerification(email, sessionToken);

        case 'login':
            if (!email || !password) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing required fields',
                        time: new Date()
                    })
                };
            }
            return handleLogin(email, password);

        case 'signup':
            if (!email || !password) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing required fields',
                        time: new Date()
                    })
                };
            }
            return handleSignup(email, password);

        case 'updateSettings':
            if (!email || !sessionToken || !settings || typeof settings.isPolitician !== 'boolean') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Missing required fields or invalid settings format',
                        time: new Date()
                    })
                };
            }
            return handleUpdateSettings(email, sessionToken, settings);

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