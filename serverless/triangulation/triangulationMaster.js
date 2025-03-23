// record timestamp and store in S3 along with nonce and IP address
const crypto = require('crypto');
const fs = require('fs');

/*
- change file name from index.mjs to index.js in AWS Lambda
- adjust AWS_REGION_OF_SLAVE for each instance
- add s3 permissions
- configure permissive CORS
- allow public lambda execution
*/
const AWS_REGION_OF_SLAVE = 'ap-northeast-1'; // eu-central-1 sa-east-1 undefined  

// Read and parse ENCRYPTION_KEY from .env file
const envFile = fs.readFileSync('.env', 'utf8');
const encryptionKeyMatch = envFile.match(/ENCRYPTION_KEY=(.+)/);
if (!encryptionKeyMatch) {
    throw new Error('ENCRYPTION_KEY not found in .env file');
}
// Convert the key to exactly 32 bytes using SHA-256
const ENCRYPTION_KEY_AES = crypto.createHash('sha256')
    .update(encryptionKeyMatch[1])
    .digest();

const IV_LENGTH = 16;

const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY_AES), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ';' + encrypted.toString('hex');
};

// Add decrypt function
const decrypt = (text) => {
    const [ivHex, encryptedHex] = text.split(';');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY_AES), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};

exports.handler = async (event, context) => {
    const ip = event.requestContext.http.sourceIp;

    // TOTP handling
    const getTOTP1 = event.queryStringParameters?.getTOTP1;
    const getTOTP2 = event.queryStringParameters?.getTOTP2;
    const TOTP1 = event.queryStringParameters?.TOTP1;

    // Handle TOTP1 request
    if (getTOTP1 === 'true') {
        const timestamp = Date.now();
        const dataToEncrypt = `${AWS_REGION_OF_SLAVE};${timestamp};${ip}`;
        const encryptedData = encrypt(dataToEncrypt);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
            body: encryptedData
        };
    }

    // Handle TOTP2 request
    if (getTOTP2 === 'true' && TOTP1) {
        try {
            // Decrypt and validate TOTP1
            const decryptedTOTP1 = decrypt(TOTP1);
            const [region, timestamp1, storedIP] = decryptedTOTP1.split(';');

            // Validate IP
            if (storedIP !== ip) {
                return {
                    statusCode: 403,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify({
                        error: 'IP address mismatch'
                    })
                };
            }
            if (region !== AWS_REGION_OF_SLAVE) {
                return {
                    statusCode: 403,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify({
                        error: 'Region mismatch'
                    })
                };
            }

            const timestamp2 = Date.now();
            const latency = timestamp2 - parseInt(timestamp1);
            const dataToEncrypt = `${AWS_REGION_OF_SLAVE};${timestamp1};${timestamp2};${ip}`;
            const encryptedData = encrypt(dataToEncrypt);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
                body: `${AWS_REGION_OF_SLAVE};${encryptedData};${latency}`
            };
        } catch (error) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    error: 'Invalid TOTP1 token'
                })
            };
        }
    }

    // Return 400 if no valid TOTP request
    return {
        statusCode: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
            error: 'Invalid request'
        })
    };
};
