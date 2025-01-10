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

const expandIPv6 = (ip) => {
    if (ip.includes('::')) {
        const [prefix, suffix] = ip.split('::');
        const prefixParts = prefix.split(':');
        const suffixParts = suffix.split(':');
        const missingParts = 8 - prefixParts.length - suffixParts.length;
        const expanded = prefixParts.concat(Array(missingParts).fill('0000')).concat(suffixParts);
        return expanded.join(':');
    }
    return ip;
}

const _64bitMask = (ip) => {
    const parts = ip.split(':');
    const mask = parts.slice(0, 4).map(i => i.padStart(4, '0')).join(':');
    return mask;
}

// Helper function to convert stream to string
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

const getPartitionKey = (ip) => {
    if (ip.includes(':')) { 
        const firstPart = ip.split(':')[0]
        const paddedIp = firstPart.padStart(4, '0');
        return paddedIp.substring(0, 2);
    }
    if (ip.includes('.')) {
        const firstPart = ip.split('.')[0]
        const paddedIp = firstPart.padStart(3, '0');
        return paddedIp.substring(0, 2);
    }
};

module.exports.handler = async (event) => {
    const vote = event.queryStringParameters.vote;
    const poll = event.queryStringParameters.poll;
    const country = event.queryStringParameters.country;
    const nonce = event.queryStringParameters.nonce;
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
    if (country && !country.match(/^[A-Z]{2}$/)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid country code',
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
    const partition = getPartitionKey(requestIp);
    const fileName = `votes/poll=${poll}/ip_prefix=${partition}/votes.csv`;

    const bucketName = 'ipvotes';

    let data = ''
    try {
        data = await fetchFileFromS3(bucketName, fileName)
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            // File does not exist, create a new one
            data = 'time,ip,poll_,vote,country,nonce\n';
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
    const lines = data.split('\n');
    const isIPv6 = requestIp.includes(':');
    if (!isIPv6) {
        for (let i = 0; i < lines.length; i++) {
            const [t, ip, v, c] = lines[i].split(',');
            if (!ip || !v || !t || !parseInt(t)) {
                continue;
            }
            if (requestIp === ip) {
                console.log('IP address already voted for ' + v + ' at ' + (new Date(parseInt(t))).toISOString());
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'IP address already voted for ' + v + ' at ' + (new Date(parseInt(t))).toISOString(),
                        time: new Date()
                    }),
                };
            }
        }
    } else {
        const fullRequestIp = expandIPv6(requestIp);
        for (let i = 0; i < lines.length; i++) {
            const [t, ip, v, c] = lines[i].split(',');
            if (!ip || !v || !t || !parseInt(t)) {
                continue;
            }
            const fullIp = expandIPv6(ip);
            if (_64bitMask(fullRequestIp) === _64bitMask(fullIp)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'IP within same /64 block ' + ip + ' already voted for ' + v + ' at ' + (new Date(parseInt(t))).toISOString(),
                        time: new Date()
                    }),
                };
            }
        }
    }
    const newVote = `${timestamp},${requestIp},${poll},${vote},${country},${nonce}\n`;
    const newVotes = data + newVote;
    const putParams = {
        Bucket: 'ipvotes',
        Key: fileName,
        Body: newVotes,
    }; 
    

    // Send the upload command to S3
    const command = new PutObjectCommand(putParams);
    const response = await s3Client.send(command);

    // validate that vote was not overwritten
    // TODO: fix architecture
    // Mitigated by partitioning by ip address

    await new Promise((resolve) => setTimeout(resolve, 1000));

    data = await fetchFileFromS3(bucketName, fileName)

    if (!data.includes(newVote)) {
        console.log('Vote was not registered');
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'An error occurred',
                time: new Date()
            }),
        };
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Vote registered',
            time: new Date()
        }),
    };  
}
