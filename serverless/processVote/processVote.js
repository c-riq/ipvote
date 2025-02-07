// Import the S3Client and GetObjectCommand from the AWS SDK
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getIPInfo } = require('./from_ipInfos/ipCountryLookup');
const https = require('https');

/* schema of csv file:
time,ip,poll_,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,closest_region,latency_ms,roundtrip_ms
1716891868980,146.103.108.202,1_or_2,2,AU,TPG Telecom Limited,false,false,false,us-east-1,120,240
*/

const { Readable } = require('stream');

// TODO: check which polls exceed the threshold to require captcha
const pollsToRequireCaptcha = []

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
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // One week in milliseconds
    
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
                // Verify that the token is not older than one week
                if (now - verificationTime < oneWeekInMs) {
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error validating cached captcha:', error);
    }
    return false;
};

const validatePhoneToken = async (phoneNumber, token, bucketName) => {
    const fileName = 'phone_number/verification.csv';
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // One week in milliseconds
    
    try {
        const data = await fetchFileFromS3(bucketName, fileName);
        const lines = data.split('\n');
        
        for (let i = 1; i < lines.length; i++) { // Skip header
            const [timestamp, storedPhone, storedToken] = lines[i].split(',');
            if (!storedPhone || !storedToken || !timestamp) continue;
            
            // Check if this verification is for the same phone and token
            if (storedPhone === phoneNumber && storedToken === token) {
                const verificationTime = parseInt(timestamp);
                const now = Date.now();
                // Verify that the token is not older than one week
                if (now - verificationTime < oneWeekInMs) {
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error validating phone token:', error);
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
    const isOpen = event.queryStringParameters.isOpen === 'true';
    const country = event.queryStringParameters.country;
    const hcaptchaToken = event.queryStringParameters.captchaToken;
    const phoneNumber = event.queryStringParameters.phoneNumber;
    const phoneToken = event.queryStringParameters.phoneToken;
    const forbiddenStringsRegex = /,|\\n|\\r|\\t|>|<|"/;

    // Prevent polls from being created with open_ prefix
    if (poll.startsWith('open_')) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Invalid poll name',
                time: new Date()
            }),
        };
    }

    // Validate vote format based on poll type
    if (isOpen) {
        // For open polls, just validate length and forbidden characters
        if (!vote || vote.length > 100 || vote.match(forbiddenStringsRegex)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Vote must be 100 characters or less and contain no special characters',
                    time: new Date()
                }),
            };
        }
    } else if (poll.includes('_or_')) {
        // For _or_ polls, vote must match one of the options
        const [option1, option2] = poll.split('_or_');
        if (vote !== option1 && vote !== option2) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Vote must match one of the poll options',
                    time: new Date()
                }),
            };
        }
    } else {
        // For yes/no polls, vote must be 'yes' or 'no'
        if (vote !== 'yes' && vote !== 'no') {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Vote must be either "yes" or "no"',
                    time: new Date()
                }),
            };
        }
    }

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
    if (poll.match(forbiddenStringsRegex)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Poll contains forbidden characters',
                time: new Date()
            }),
        };
    }

    let captchaVerified = 0
    let verifiedPhone = '';

    if (pollsToRequireCaptcha.includes(poll)) {
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
            captchaVerified = isHuman ? 1 : 0
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
    }

    if (phoneNumber && phoneToken) {
        try {
            const isValidPhone = await validatePhoneToken(
                phoneNumber,
                phoneToken,
                'ipvotes'
            );
            if (isValidPhone) {
                verifiedPhone = phoneNumber;
            } else {
                console.log('Invalid phone verification:', {
                    phoneNumber,
                    time: new Date()
                });
            }
        } catch (error) {
            console.error('Phone verification error:', error);
        }
    }

    const requestIp = event.requestContext.http.sourceIp;
    const timestamp = new Date().getTime();
    const partition = getPartitionKey(requestIp);
    // Prepend 'open_' to poll name in file path if isOpen is true
    const pollPath = isOpen ? `open_${poll}` : poll;
    const fileName = `votes/poll=${pollPath}/ip_prefix=${partition}/votes.csv`;

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
            data = 'time,ip,poll_,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,'+
                'closest_region,latency_ms,roundtrip_ms,captcha_verified,phone_number\n';
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
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // One week in milliseconds
    
    if (!isIPv6) {
        for (let i = 0; i < lines.length; i++) {
            const [t, ip] = lines[i].split(',');
            if (!ip || !t || !parseInt(t)) {
                continue;
            }
            if (requestIp === ip) {
                const previousVoteTime = parseInt(t);
                const timeSinceLastVote = timestamp - previousVoteTime;
                
                if (timeSinceLastVote < oneWeekInMs) {
                    const nextVoteTime = new Date(previousVoteTime + oneWeekInMs);
                    console.log('IP address voted too recently:', {
                        lastVote: new Date(previousVoteTime).toISOString(),
                        nextVoteAllowed: nextVoteTime.toISOString()
                    });
                    return {
                        statusCode: 400,
                        body: JSON.stringify({
                            message: `Cannot vote again for this poll until ${nextVoteTime.toISOString()}`,
                            time: new Date()
                        }),
                    };
                }
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
                const previousVoteTime = parseInt(t);
                const timeSinceLastVote = timestamp - previousVoteTime;
                
                if (timeSinceLastVote < oneWeekInMs) {
                    const nextVoteTime = new Date(previousVoteTime + oneWeekInMs);
                    return {
                        statusCode: 400,
                        body: JSON.stringify({
                            message: `Cannot vote again for this poll from this IPv6 block until ${nextVoteTime.toISOString()}`,
                            time: new Date()
                        }),
                    };
                }
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

    // Create new vote line with GeoIP data (added new columns with empty values)
    const newVote = `${timestamp},${requestIp},${poll},${vote},${
        countryGeoip.replace(/,|"/g, '')},${asnNameGeoip.replace(/,|"/g, '')},,,,,,,${
            captchaVerified},${verifiedPhone}`;
    console.log('Attempting to save vote:', {
        fileName,
        voteData: newVote.trim()
    });
    // Ensure proper newlines both before and after the new vote
    const newVotes = (data.endsWith('\n') ? data : data + '\n') + newVote + '\n';
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
