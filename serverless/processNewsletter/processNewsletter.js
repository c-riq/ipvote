const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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
    return fileContents;
};

// Helper function to convert stream to string
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

module.exports.handler = async (event) => {
    const email = event.queryStringParameters.email;
    const forbiddenStringsRegex = /,|\\n|\\r|\\t|>|</;
    
    // Validate email parameter
    if (!email) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing email parameter',
                time: new Date()
            }),
        };
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid email format',
                time: new Date()
            }),
        };
    }

    if (email.match(forbiddenStringsRegex)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Email contains forbidden characters',
                time: new Date()
            }),
        };
    }

    const timestamp = new Date().getTime();
    const fileName = 'newsletter/subscriptions.csv';
    const bucketName = 'ipvotes';

    let data = '';
    try {
        data = await fetchFileFromS3(bucketName, fileName);
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            // File does not exist, create a new one
            data = 'time,email\n';
        } else {
            console.log(error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'An error occurred',
                    time: new Date()
                }),
            };
        }
    }

    // Check if email already exists
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const [t, e] = lines[i].split(',');
        if (!e || !t || !parseInt(t)) {
            continue;
        }
        if (email.toLowerCase() === e.toLowerCase()) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Email already subscribed',
                    time: new Date()
                }),
            };
        }
    }

    const newSubscription = `${timestamp},${email}\n`;
    const newData = data + newSubscription;
    
    const putParams = {
        Bucket: bucketName,
        Key: fileName,
        Body: newData,
    };

    // Send the upload command to S3
    const command = new PutObjectCommand(putParams);
    await s3Client.send(command);

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Newsletter subscription registered',
            time: new Date()
        }),
    };
}; 
