// Import the S3Client and GetObjectCommand from the AWS SDK
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
    const vote = event.queryStringParameters.vote;
    const poll = event.queryStringParameters.poll;
    const forbiddenStringsRegex = /,|\\n|\\r|\\t|>|</;
    if (!vote || !poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing vote or poll parameters',
                time: new Date()
            }),
        };
    }
    if (poll.match(forbiddenStringsRegex) || vote.match(forbiddenStringsRegex)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Poll or vote contains forbidden characters',
                time: new Date()
            }),
        };
    }
    const requestIp = event.requestContext.http.sourceIp;
    const timestamp = new Date().getTime();
    const fileName = poll + '/votes.csv';

    const bucketName = 'ipvotes';

    let data = ''
    try {
        data = await fetchFileFromS3(bucketName, fileName)
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            // File does not exist, create a new one
            data = 't,ip,vote\n';
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'An error occurred',
                    time: new Date()
                }),
            };
        }
    }
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const [t, ip, v] = lines[i].split(',');
        if (requestIp === ip) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'IP address already voted: ' + lines[i],
                    time: new Date()
                }),
            };
        }
    }
    const newVote = `${timestamp},${requestIp},${vote}\n`;
    const newVotes = data + newVote;
    const putParams = {
        Bucket: 'ipvotes',
        Key: fileName,
        Body: newVotes,
    }; 
    

    // Send the upload command to S3
    const command = new PutObjectCommand(putParams);
    const response = await s3Client.send(command);
    
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Vote registered',
            time: new Date()
        }),
    };  
}
