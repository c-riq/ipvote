import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Lambda } from '@aws-sdk/client-lambda';
import { APIGatewayProxyEventV2 as APIGatewayEvent } from 'aws-lambda';
import { getIPInfo } from './from_ipInfos/ipCountryLookup';
import { expandIPv6, _64bitMask, getPartitionKey } from './utils/ipUtils';
import { fetchFileFromS3, s3Client } from './utils/s3Utils';
import { 
    validateCachedCaptcha, 
    validatePhoneToken, 
    validateSessionToken,
    checkIfPollDisabled 
} from './utils/validators';
import { createHash } from 'crypto';
import { decryptLatencyToken } from './utils/decryptionUtils';

interface APIResponse {
    statusCode: number;
    body: string;
}

/* schema of csv file:
time,ip,poll_,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,closest_region,latency_ms,roundtrip_ms,captcha_verified,phone_number,user_id
1716891868980,146.103.108.202,Abolish the US Electoral College,yes,US,Comcast Cable Communications%2C LLC,0,,,us-west-2,65.5,145,,,
*/

// TODO: check which polls exceed the threshold to require captcha
const pollsToRequireCaptcha: string[] = []

const lambda = new Lambda();

export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
    const origin = event.headers?.origin || '';
    const referer = event.headers?.referer || '';
    
    const allowedOrigins = ['http://localhost:5173', 'https://ip-vote.com'];
    const isValidOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes(origin.replace(/\/$/, ''));
    const isValidReferer = allowedOrigins.some(allowed => 
        referer === allowed || 
        referer.startsWith(allowed + '/')
    );

    if (!isValidOrigin || !isValidReferer) {
        console.log('Invalid origin or referer:', { origin, referer });
        return {
            statusCode: 403,
            body: JSON.stringify({
                message: 'Unauthorized request origin',
                time: new Date()
            }),
        };
    }

    if (!event.queryStringParameters) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing query parameters',
                time: new Date()
            }),
        };
    }

    console.log('Processing vote request:', {
        ip: event.requestContext.http.sourceIp,
        poll: event.queryStringParameters.poll,
        vote: event.queryStringParameters.vote,
        timestamp: new Date().toISOString()
    });

    const { 
        vote,
        poll: rawPoll,
        isOpen,
        country,
        captchaToken: hcaptchaToken,
        phoneNumber,
        phoneToken,
        email,
        sessionToken
    } = event.queryStringParameters;

    if (!vote || !rawPoll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing vote or poll parameters',
                time: new Date()
            }),
        };
    }

    // Replace commas with %2C
    const poll = rawPoll.replace(/,/g, '%2C');
    const forbiddenStringsRegex = /,|\\n|\\r|\\t|>|<|"|=/;

    // Validate session token if provided
    let userId = '';
    if (email && sessionToken) {
        userId = await validateSessionToken(email, sessionToken) || '';
    }

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
                message: 'Poll contains forbidden characters: ' + poll,
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

    // Check if poll is disabled before processing vote
    const isDisabled = await checkIfPollDisabled(pollPath, bucketName);
    if (isDisabled) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Voting has been permanently disabled for this poll',
                time: new Date()
            }),
        };
    }

    let data = ''
    try {
        data = await fetchFileFromS3(bucketName, fileName)
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
            // File does not exist, create a new one with updated schema
            data = 'time,ip,poll_,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,'+
                'closest_region,latency_ms,roundtrip_ms,captcha_verified,phone_number,user_id,'+
                'eu-central-1-latency,ap-northeast-1-latency,sa-east-1-latency,us-east-1-latency,'+
                'us-west-2-latency,ap-south-1-latency,eu-west-1-latency,af-south-1-latency\n';
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

    // Get encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
        console.error('Missing ENCRYPTION_KEY environment variable');
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Server configuration error',
                time: new Date()
            }),
        };
    }

    // Convert the key to exactly 32 bytes using SHA-256
    const encryptionKeyBuffer = createHash('sha256')
        .update(encryptionKey)
        .digest();

    // Process latency tokens if present
    const latencyTokens = event.queryStringParameters?.latencyTokens?.split(',') || [];
    const latencies: { [key: string]: number } = {};
    
    for (const token of latencyTokens) {
        const result = decryptLatencyToken(token, encryptionKeyBuffer, requestIp);
        if (result) {
            latencies[`${result.region}-latency`] = result.latency;
        }
    }

    // Add validation for all required latency tokens
    const requiredRegions = [
        'eu-central-1',
        'ap-northeast-1',
        'sa-east-1',
        'us-east-1',
        'us-west-2',
        'ap-south-1',
        'eu-west-1',
        'af-south-1'
    ];

    const missingRegions = requiredRegions.filter(region => 
        !latencies.hasOwnProperty(`${region}-latency`)
    );

    if (missingRegions.length > 0) {
        console.log('Missing latency tokens for regions:', missingRegions);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing latency measurements for some regions',
                missingRegions,
                time: new Date()
            }),
        };
    }

    // Update the CSV schema and new vote line
    const newVote = `${timestamp},${requestIp},${poll},${vote},${
        countryGeoip.replace(/,|"/g, '')},${asnNameGeoip.replace(/,|"/g, '')},,,,,,,${
            captchaVerified},${verifiedPhone},${userId},${
            latencies['eu-central-1-latency'] || ''},${
            latencies['ap-northeast-1-latency'] || ''},${
            latencies['sa-east-1-latency'] || ''},${
            latencies['us-east-1-latency'] || ''},${
            latencies['us-west-2-latency'] || ''},${
            latencies['ap-south-1-latency'] || ''},${
            latencies['eu-west-1-latency'] || ''},${
            latencies['af-south-1-latency'] || ''}`;

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

    // After vote verification and before returning success
    try {
        // Call the recentVotes lambda function
        lambda.invoke({
            FunctionName: 'recentVotes',
            InvocationType: 'Event', // Asynchronous invocation
            Payload: JSON.stringify({
                poll: isOpen ? `open_${poll}` : poll,  // Add open_ prefix for open polls
                vote: vote,
                timestamp: timestamp,
                ip: requestIp,
                country: countryGeoip
            })
        });
    } catch (error) {
        console.error('Failed to update recent votes:', error);
        // Continue execution even if recent votes update fails
    }

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
