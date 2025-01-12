// aws lambda function to get the most popular polls using athena

const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';
const CACHE_KEY = 'popular_polls/cached_results.json';

async function listAllVoteFiles() {
    const files = [];
    let continuationToken = undefined;
    
    do {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'votes/',
            ContinuationToken: continuationToken
        });
        
        const response = await s3Client.send(command);
        if (response.Contents) {
            files.push(...response.Contents);
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return files;
}

async function aggregateVotes() {
    const pollCounts = new Map();
    const files = await listAllVoteFiles();
    
    for (const file of files) {
        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: file.Key
            }));
            
            const content = await response.Body.transformToString();
            const lines = content.split('\n');
            
            // Skip header line
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const [, , poll] = line.split(',');
                if (!poll) continue;
                
                const currentCount = pollCounts.get(poll) || 0;
                pollCounts.set(poll, currentCount + 1);
            }
        } catch (error) {
            console.error(`Error processing file ${file.Key}:`, error);
        }
    }
    
    // Convert to array and sort by count
    const results = Array.from(pollCounts.entries())
        .map(([poll, count]) => [poll, count])
        .sort((a, b) => b[1] - a[1]);
    
    return results;
}

function generateRandomSelection(fullData) {
    // Select 4 random polls from top 5
    const top4 = fullData.slice(0, 4);
    const remaining = fullData.slice(4);
    
    const selectedRemaining = shuffleArray([...remaining]).slice(0, 2);
    
    return [...top4, ...selectedRemaining];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports.handler = async (event) => {
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    
    // Try cache first if not forcing refresh
    if (!forceRefresh) {
        try {
            const cachedData = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: CACHE_KEY
            }));
            const data = JSON.parse(await cachedData.Body.transformToString());
            
            // Check if cache is less than 24 hours old
            const cacheAge = Date.now() - data.timestamp;
            const cacheValid = cacheAge < 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (cacheValid) {
                console.log('Cache hit - returning new random selection from cached data');
                const selectedPolls = generateRandomSelection(data.results.fullData);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        columns: ['poll', 'count'],
                        data: selectedPolls
                    }),
                    headers: {
                        'X-Cache': 'HIT',
                        'X-Cache-Age': Math.round(cacheAge / 1000) // age in seconds
                    }
                };
            } else {
                console.log('Cache expired - regenerating');
            }
        } catch (error) {
            console.log('Cache miss or error:', error.message);
        }
    }

    // Aggregate votes directly from S3
    const aggregatedData = await aggregateVotes();
    
    // Cache the full result set
    const cacheObject = {
        timestamp: Date.now(),
        results: {
            columns: ['poll', 'count'],
            fullData: aggregatedData
        }
    };

    // Cache the results with timestamp
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CACHE_KEY,
        Body: JSON.stringify(cacheObject),
        ContentType: 'application/json'
    }));

    // Generate random selection from the full dataset
    const selectedPolls = generateRandomSelection(aggregatedData);

    return {
        statusCode: 200,
        body: JSON.stringify({
            columns: ['poll', 'count'],
            data: selectedPolls
        }),
        headers: {
            'X-Cache': 'MISS'
        }
    };
};

