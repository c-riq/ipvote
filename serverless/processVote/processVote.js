// Import the S3Client and GetObjectCommand from the AWS SDK
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getIPInfo } = require('./from_ipInfos/ipCountryLookup');
const https = require('https');

/* schema of csv file:
time,ip,poll_,vote,country,nonce,country_geoip,asn_name_geoip
1716891868980,146.103.108.202,1_or_2,2,,sdfsdf,AU,TPG Telecom Limited
*/

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

const validateCachedCaptcha = async (ip, token, bucketName) => {
    const fileName = 'captcha_cache/verifications.csv';
    try {
        const data = await fetchFileFromS3(bucketName, fileName);
        const lines = data.split('\n');
        
        for (let i = 1; i < lines.length; i++) { // Skip header
            const [cachedIp, cachedToken, timestamp] = lines[i].split(',');
            if (!cachedIp || !cachedToken || !timestamp) continue;
            
            // Check if this verification is for the same IP and token
            if (cachedIp === ip && cachedToken === token) {
                const verificationTime = parseInt(timestamp);
                const now = Date.now();
                // Verify that the token is not older than 5 minutes
                if (now - verificationTime < 5 * 60 * 1000) {
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error validating cached captcha:', error);
    }
    return false;
};

module.exports.handler = async (event) => {
    console.log('Processing vote request:', {
        ip: event.requestContext.http.sourceIp,
        poll: event.queryStringParameters.poll,
        vote: event.queryStringParameters.vote,
        timestamp: new Date().toISOString()
    });

    const vote = event.queryStringParameters.vote;
    const poll = event.queryStringParameters.poll;
    const country = event.queryStringParameters.country;
    const nonce = event.queryStringParameters.nonce;
    const hcaptchaToken = event.queryStringParameters.captchaToken;
    const forbiddenStringsRegex = /,|\\n|\\r|\\t|>|<|"/;
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
    if (!hcaptchaToken) {
        console.log('missing hcaptcha token:', {
            hcaptchaToken,
            time: new Date()
        });
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing hCaptcha verification',
                time: new Date()
            }),
        };
    }

    try {
        const isHuman = await validateCachedCaptcha(
            event.requestContext.http.sourceIp,
            hcaptchaToken,
            'ipvotes'
        );
        console.log('Cached captcha verification result:', isHuman);
        if (!isHuman) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid or expired captcha verification',
                    time: new Date()
                }),
            };
        }
    } catch (error) {
        console.error('Captcha verification error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to verify captcha',
                time: new Date()
            }),
        };
    }

    const requestIp = event.requestContext.http.sourceIp;
    const timestamp = new Date().getTime();
    const partition = getPartitionKey(requestIp);
    const fileName = `votes/poll=${poll}/ip_prefix=${partition}/votes.csv`;

    console.log('Vote file details:', {
        fileName,
        partition,
        requestIp,
        isIPv6: requestIp.includes(':')
    });

    const bucketName = 'ipvotes';

    let data = ''
    try {
        data = await fetchFileFromS3(bucketName, fileName)
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            // File does not exist, create a new one with updated schema
            data = 'time,ip,poll_,vote,country,nonce,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider\n';
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
            const [t, ip] = lines[i].split(',');
            if (!ip || !t || !parseInt(t)) {
                continue;
            }
            if (requestIp === ip) {
                console.log('IP address already voted for at ' + (new Date(parseInt(t))).toISOString());
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'IP address already voted at ' + (new Date(parseInt(t))).toISOString(),
                        time: new Date()
                    }),
                };
            }
        }
    } else {
        const fullRequestIp = expandIPv6(requestIp);
        for (let i = 0; i < lines.length; i++) {
            const [t, ip] = lines[i].split(',');
            if (!ip || !t || !parseInt(t)) {
                continue;
            }
            const fullIp = expandIPv6(ip);
            if (_64bitMask(fullRequestIp) === _64bitMask(fullIp)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'IP within same /64 block ' + ip + ' already voted at ' + (new Date(parseInt(t))).toISOString(),
                        time: new Date()
                    }),
                };
            }
        }
    }

    // Get GeoIP information
    const ipInfo = getIPInfo(requestIp);
    console.log('IP info retrieved:', {
        country: ipInfo?.country,
        asn: ipInfo?.as_name,
        requestIp
    });
    const countryGeoip = ipInfo?.country || 'XX';
    const asnNameGeoip = ipInfo?.as_name || '';

    // Create new vote line with GeoIP data
    const newVote = `${timestamp},${requestIp},${poll},${vote},${country},${nonce},${countryGeoip.replace(/,|"/g, '')},${asnNameGeoip.replace(/,|"/g, '')},,,\n`;
    console.log('Attempting to save vote:', {
        fileName,
        voteData: newVote.trim()
    });
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
        console.log('Vote verification failed:', {
            fileName,
            expectedVote: newVote.trim(),
            dataLength: data.length
        });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'An error occurred',
                time: new Date()
            }),
        };
    }
    
    console.log('Vote successfully registered:', {
        fileName,
        timestamp: new Date().toISOString()
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Vote registered',
            time: new Date()
        }),
    };  
}
