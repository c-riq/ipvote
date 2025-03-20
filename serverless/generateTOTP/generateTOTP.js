const crypto = require('crypto');

// Use environment variable for the encryption key
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // AES block size

const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

module.exports.handler = async (event) => {
    // Add CORS headers
    const allowedOrigins = ['http://localhost:5173', 'https://ip-vote.com'];
    const origin = event.headers?.origin || '';
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
    };

    try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const sourceIP = event.requestContext.http.sourceIp;
        const dataToEncrypt = `${timestamp}:${sourceIP}`;
        
        const encryptedData = encrypt(dataToEncrypt);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                token: encryptedData,
                expires: parseInt(timestamp) + 300 // Token expires in 5 minutes
            })
        };
    } catch (error) {
        console.error('Error generating TOTP:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Error generating token',
                time: new Date()
            })
        };
    }
}; 