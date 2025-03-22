// AWS lambda node.js to respond with random nonce
// record timestamp and store in S3 along with nonce and IP address
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const fs = require('fs');

/*
- change file name from index.mjs to index.js in AWS Lambda
- adjust IS_SLAVE and AWS_REGION_OF_SLAVE for each instance
- increase timeout for slave to 5 s 
- add s3 permissions
- configure permissive CORS
- allow public lambda execution
*/
const IS_SLAVE = false;
const AWS_REGION_OF_SLAVE = 'ap-northeast-1'; // eu-central-1 sa-east-1 undefined  
const DELAY = 1000; // to have a predictable delay. s3 requests fail if lambda response is sent too early


const awsRegionOfMaster = 'us-east-1';

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
    const lambdaStartTimestamp = new Date().getTime();
    //context.callbackWaitsForEmptyEventLoop = !!IS_SLAVE; // does not work

    const proxyId = event.queryStringParameters?.proxyId;
    const nonce = event.queryStringParameters?.nonce;
    const clientStartTimestamp = event.queryStringParameters?.clientStartTimestamp;
    const clientReceivedNonceTimestamp = event.queryStringParameters?.clientReceivedNonceTimestamp;
    const ip = event.requestContext.http.sourceIp;

    // Add TOTP handling
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
            

            // Get current timestamp with millisecond precision
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

    if (!proxyId && !nonce) {
        // master initial request
        if (IS_SLAVE) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Slave cannot generate nonce',
                    time: new Date()
                }),
            };
        }
        const nonce = Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15);

        const s3 = new S3Client({ region: awsRegionOfMaster });
        const nonceSentTime = new Date().getTime() + DELAY;
        const command = new PutObjectCommand({
            Bucket: 'ipvotes',
            Key: `triangulation/${ip.replace(/:/g, ';')}/${nonce}-1.json`,
            Body: JSON.stringify({ event: 'nonceGeneratedAtMaster',nonce, ip, lambdaStartTimestamp, 
                awsRegionOfMaster, nonceSentTime, clientStartTimestamp })
        });
        s3.send(command);
        await new Promise(resolve => setTimeout(resolve, DELAY));
        return {
            statusCode: 200,
            body: {nonce, lambdaStartTimestamp, nonceSentTime},
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            }
        };
    }

    if (proxyId && nonce) {
        // proxied request
        const s3 = new S3Client({ region: awsRegionOfMaster });
        
        // Check if file already exists
        const listCommand = new ListObjectsV2Command({
            Bucket: 'ipvotes',
            Prefix: `${ip.replace(/:/g, ';')}/${nonce}-${proxyId}.json`
        });
        const listResponse = await s3.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Record already exists',
                    time: new Date()
                }),
            };
        }

        const putCommand = new PutObjectCommand({
            Bucket: 'ipvotes',
            Key: `triangulation/${ip.replace(/:/g, ';')}/${nonce}-${proxyId}.json`,
            Body: JSON.stringify({ event: 'proxyRequestReceived', nonce, ip, 
                lambdaStartTimestamp, awsRegionOfMaster, proxyId,
                clientStartTimestamp, clientReceivedNonceTimestamp
            })
        });
        s3.send(putCommand);
        await new Promise(resolve => setTimeout(resolve, DELAY));
        
        return {
            statusCode: 200,
            body: nonce
        };
    }

    if (!proxyId && nonce && clientReceivedNonceTimestamp) {
        // slave
        const s3 = new S3Client({ region: awsRegionOfMaster });

        // Check if file already exists
        const fileKey = `triangulation/${ip.replace(/:/g, ';')}/${nonce}-unproxied-${AWS_REGION_OF_SLAVE}.json`;
        const listCommand = new ListObjectsV2Command({
            Bucket: 'ipvotes',
            Prefix: fileKey
        });
        const listResponse = await s3.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Record already exists',
                    time: new Date()
                }),
            };
        }

        const command = new PutObjectCommand({
            Bucket: 'ipvotes',
            Key: fileKey,
            Body: JSON.stringify({ event: 'nonceReceivedAtSlave', nonce, ip, lambdaStartTimestamp, 
                awsRegionOfSlave: AWS_REGION_OF_SLAVE, lambdaDuration: new Date().getTime() - lambdaStartTimestamp, 
                clientReceivedNonceTimestamp })
        });
        s3.send(command);
        await new Promise(resolve => setTimeout(resolve, DELAY));
        const latencyResponseTimestamp = new Date().getTime();
        return {
            statusCode: 200,
            body: {lambdaStartTimestamp, nonce, latencyResponseTimestamp},
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            }
        };
    }

};
