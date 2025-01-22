// Import the S3Client and GetObjectCommand from the AWS SDK
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

const { Readable } = require('stream');

const s3Client = new S3Client(); 

const fetchFileFromS3 = async (bucketName, key) => {
    const getObjectParams = {
        Bucket: bucketName,
        Key: key,
    };
    const command = new GetObjectCommand(getObjectParams);
    const response = await s3Client.send(command);
    const fileContents = await streamToString(response.Body);
    
    // Filter out old entries
    const twentyFiveHoursAgo = new Date().getTime() - (25 * 60 * 60 * 1000);
    const lines = fileContents.split('\n');
    const header = lines[0];
    const validLines = lines.slice(1).filter(line => {
        if (!line) return false;
        const [, , timestamp] = line.split(',');
        return parseInt(timestamp) > twentyFiveHoursAgo;
    });
    
    return [header, ...validLines].join('\n');
};

// Helper function to convert stream to string
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

const verifyHCaptcha = async (token) => {
    const secret = process.env.HCAPTCHA_SECRET_KEY;
    
    return new Promise((resolve, reject) => {
        const data = `secret=${secret}&response=${token}`;
        
        const options = {
            hostname: 'hcaptcha.com',
            port: 443,
            path: '/siteverify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let response = '';
            
            res.on('data', (chunk) => {
                response += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedResponse = JSON.parse(response);
                    console.log('hCaptcha verification response:', parsedResponse);
                    resolve(parsedResponse.success);
                } catch (e) {
                    reject(e);
                    console.error('hCaptcha verification error:', e);
                }
            });
        });

        req.on('error', (error) => {
            console.error('hCaptcha verification error:', error);
            reject(error);
        });

        req.write(data);
        req.end();
    });
};

module.exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    let body;
    try {
        body = JSON.parse(event.body);
        console.log('Parsed body:', body);
    } catch (error) {
        console.error('Failed to parse request body:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid request body',
                error: error.message,
                time: new Date()
            }),
        };
    }

    const hcaptchaToken = body.captchaToken;
    const clientIp = body.ip;
    const requestIp = event.requestContext.http.sourceIp;
    const timestamp = new Date().getTime();

    console.log('Request details:', {
        hcaptchaToken,
        requestIp,
        clientIp,
        timestamp
    });

    if (!hcaptchaToken) {
        console.log('Missing hCaptcha token');
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing hCaptcha verification',
                time: new Date()
            }),
        };
    }
    if (requestIp !== clientIp) {
        console.log('IP mismatch detected:', { requestIp, clientIp });
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'IP mismatch ' + requestIp + ' ' + clientIp,
                time: new Date()
            }),
        };
    }

    try {
        console.log('Attempting hCaptcha verification with token:', hcaptchaToken);
        const isHuman = await verifyHCaptcha(hcaptchaToken);
        console.log('hCaptcha verification result:', isHuman);
        
        if (!isHuman) {
            console.log('hCaptcha verification failed');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'hCaptcha verification failed',
                    time: new Date()
                }),
            };
        }

        // Store successful captcha verification in S3
        const fileName = 'captcha_cache/verifications.csv';
        const bucketName = 'ipvotes';
        
        console.log('Attempting to fetch existing verifications from S3');
        let data = '';
        try {
            data = await fetchFileFromS3(bucketName, fileName);
            console.log('Successfully fetched existing verifications');
            if (!data.endsWith('\n')) {
                data += '\n';
            }
        } catch (error) {
            console.log('Error fetching from S3:', error);
            if (error.name === 'NoSuchKey') {
                console.log('Creating new verifications file');
                data = 'ip,token,timestamp\n';
            } else {
                console.error('Unexpected S3 error:', error);
                throw error;
            }
        }

        // Add new verification to cache
        const newVerification = `${requestIp},${hcaptchaToken},${timestamp}\n`;
        const updatedData = data + newVerification;
        console.log('Preparing to write updated verifications to S3');

        const putParams = {
            Bucket: bucketName,
            Key: fileName,
            Body: updatedData,
        };

        const command = new PutObjectCommand(putParams);
        await s3Client.send(command);
        console.log('Successfully updated verifications in S3');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Captcha verification successful',
                time: new Date()
            }),
        };

    } catch (error) {
        console.error('Error in verification process:', error);
        console.error('Stack trace:', error.stack);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to verify hCaptcha',
                error: error.message,
                time: new Date()
            }),
        };
    }
};
