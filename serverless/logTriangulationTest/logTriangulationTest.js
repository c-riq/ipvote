const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

exports.handler = async (event, context) => {
    const ip = event.requestContext.http.sourceIp;
    
    // Create payload with all available data
    const payload = {
        ip,
        body: event.body ? JSON.parse(event.body) : null,
    };

    // Save to S3
    const s3 = new S3Client({ region: 'us-east-1' });
    const command = new PutObjectCommand({
        Bucket: 'ipvotes',
        Key: `triangulation_test/${ip.replace(/:/g, ';')}_${new Date().getTime()}.json`,
        Body: JSON.stringify(payload, null, 2)
    });

    await s3.send(command);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: 'Request logged',
        })
    };
}; 