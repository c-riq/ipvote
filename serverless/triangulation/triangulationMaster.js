// AWS lambda node.js to respond with random nonce
// record timestamp and store in S3 along with nonce and IP address
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

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


const awsRegionOfMaster = 'us-east-1';

exports.handler = async (event, context) => {
    const lambdaStartTimestamp = new Date().getTime();
    //context.callbackWaitsForEmptyEventLoop = !!IS_SLAVE; // does not work

    const proxyId = event.queryStringParameters?.proxyId;
    const nonce = event.queryStringParameters?.nonce;
    const clientStartTimestamp = event.queryStringParameters?.clientStartTimestamp;
    const clientReceivedNonceTimestamp = event.queryStringParameters?.clientReceivedNonceTimestamp;
    const ip = event.requestContext.http.sourceIp;

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
        const DELAY = 1000; // to have a predictable delay. s3 requests fail if lambda response is sent too early
        const command = new PutObjectCommand({
            Bucket: 'ipvotes',
            Key: `triangulation/${nonce}-1.json`,
            Body: JSON.stringify({ event: 'nonceGeneratedAtMaster',nonce, ip, lambdaStartTimestamp, 
                awsRegionOfMaster, nonceSentTime: new Date().getTime() + DELAY })

        });
        s3.send(command);
        await new Promise(resolve => setTimeout(resolve, DELAY));
        return {
            statusCode: 200,
            body: nonce
        };
    }

    if (proxyId && nonce) {
        // proxied request
        const s3 = new S3Client({ region: awsRegionOfMaster });
        
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
            Key: `triangulation/${nonce}-${proxyId}.json`,
            Body: JSON.stringify({ event: 'proxyRequestReceived', nonce, ip, 
                lambdaStartTimestamp, awsRegionOfMaster, proxyId,
                clientStartTimestamp, clientReceivedNonceTimestamp
            })
        });
        await s3.send(putCommand);  

        return {
            statusCode: 200,
            body: nonce
        };
    }

    if (!proxyId && nonce && clientReceivedNonceTimestamp) {
        // slave
        const s3 = new S3Client({ region: awsRegionOfMaster });

        // Check if file already exists
        const fileKey = `triangulation/${nonce}-unproxied-${AWS_REGION_OF_SLAVE}.json`;
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
        await s3.send(command);
        return {
            statusCode: 200,
            body: nonce
        };
    }

};