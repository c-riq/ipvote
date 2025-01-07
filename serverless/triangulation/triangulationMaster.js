// AWS lambda node.js to respond with random nonce
// record timestamp and store in S3 along with nonce and IP address
const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

exports.handler = async (event) => {
    const arrival_timestamp = new Date().getTime();

    const proxyId = event.queryStringParameters?.proxyId;
    const nonce = event.queryStringParameters?.nonce;
    const ip = event.requestContext.http.sourceIp;

    if (!proxyId && !nonce) {

        const nonce = Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15);

        const s3 = new S3Client({ region: 'us-east-1' });
        const command = new PutObjectCommand({
            Bucket: 'ipvotes',
            Key: `${nonce}-1.json`,
            Body: JSON.stringify({ event: 'nonceGeneration',nonce, ip, timestamp: arrival_timestamp })

        });
        s3.send(command);
        return {
            statusCode: 200,
            body: nonce
        };
    }

    if (proxyId && nonce) {
        const s3 = new S3Client({ region: 'us-east-1' });
        
        // Check if file already exists
        const listCommand = new ListObjectsV2Command({
            Bucket: 'ipvotes',
            Prefix: `${nonce}-${proxyId}.json`
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
            Key: `${nonce}-${proxyId}.json`,
            Body: JSON.stringify({ event: 'proxyRequestReceived',nonce, ip, timestamp: arrival_timestamp })
        });
        await s3.send(putCommand);  

        return {
            statusCode: 200,
            body: nonce
        };
    }

};