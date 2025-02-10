// aws lambda function to get the most popular polls using athena

const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';

// Add this at the top level with other constants
const metadataCache = new Map();

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

async function aggregateVotes(query = '', pollToUpdate = null, tagFilter = null) {
    const pollCounts = new Map();
    const files = await listAllVoteFiles();
    const searchTerms = query.toLowerCase().split(/\s+/);
    
    for (const file of files) {
        try {
            let pollFromPath = file.Key.split('/')[1]?.split('.')[0];
            pollFromPath = pollFromPath?.replace('poll=', '');
            
            // Check tag filter first if present
            if (tagFilter) {
                try {
                    const metadataPath = `metadata/poll=${pollFromPath}/metadata.json`;
                    
                    // Try to get metadata from cache first
                    let pollMetadata;
                    if (metadataCache.has(metadataPath)) {
                        pollMetadata = metadataCache.get(metadataPath);
                    } else {
                        const metadata = await s3Client.send(new GetObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: metadataPath
                        }));
                        const metadataContent = await metadata.Body.transformToString();
                        pollMetadata = JSON.parse(metadataContent);
                        // Cache the metadata
                        metadataCache.set(metadataPath, pollMetadata);
                    }
                    
                    // Count tag occurrences
                    const tagCounts = {};
                    pollMetadata.tags.forEach(t => {
                        const tag = t.tag.toLowerCase();
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });

                    // Find the most frequent tag
                    const mostFrequentTag = Object.entries(tagCounts)
                        .sort((a, b) => b[1] - a[1])[0]?.[0];

                    // Skip if the most frequent tag doesn't match the filter
                    if (!mostFrequentTag || mostFrequentTag !== tagFilter.toLowerCase()) {
                        continue;
                    }
                } catch (error) {
                    // If metadata doesn't exist or there's an error, skip this poll
                    continue;
                }
            }

            if (pollToUpdate) {
                const pollPath = `votes/poll=${pollToUpdate}/`;
                if (!file.Key.startsWith(pollPath)) {
                    continue;
                }
            } else if (query) {
                if (!pollFromPath || !searchTerms.every(term => 
                    pollFromPath.toLowerCase().replace(/_/g, ' ').includes(term)
                )) {
                    continue;
                }
            }

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
                if (poll !== pollFromPath && poll !== pollFromPath.replace(/^open_/g, '')) continue;
                
                const currentCount = pollCounts.get(pollFromPath) || 0;
                pollCounts.set(pollFromPath, currentCount + 1);
            }
        } catch (error) {
            console.error(`Error processing file ${file.Key}:`, error);
        }
    }
    
    // Convert to array and sort by count
    const results = Array.from(pollCounts.entries())
        .map(([poll, count]) => [poll, count])
        .sort((a, b) => b[1] - a[1]);

    // If pollToUpdate is set, only return that poll's data
    if (pollToUpdate) {
        return results.filter(([poll]) => poll === pollToUpdate);
    }
    
    return results;
}

function generateRandomSelection(fullData, seed, limit = 30, offset = 0) {
    // Use seed for consistent randomization
    const seededRandom = (seed) => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    // Seeded shuffle function
    const seededShuffle = (array, seed) => {
        let currentSeed = seed;
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Keep top 10 fixed, shuffle the rest with seed
    const topPolls = fullData.slice(0, 10);
    const remainingPolls = seededShuffle(fullData.slice(10), seed);
    
    // Combine and paginate
    const combinedPolls = [...topPolls, ...remainingPolls];
    return combinedPolls.slice(offset, offset + limit);
}

module.exports.handler = async (event) => {
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    const pollToUpdate = event?.queryStringParameters?.pollToUpdate;
    const seed = parseInt(event?.queryStringParameters?.seed) || 1;
    const limit = parseInt(event?.queryStringParameters?.limit) || 15;
    const offset = parseInt(event?.queryStringParameters?.offset) || 0;
    const query = event?.queryStringParameters?.q || '';
    const tagFilter = event?.queryStringParameters?.tag || '';
    
    // Update cache key to include tag filter
    const CACHE_KEY = `popular_polls/cached_results_${seed}_${query}_${tagFilter}.json`;
    
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
            const cacheValid = cacheAge < 24 * 60 * 60 * 1000;
            
            if (cacheValid) {
                // If updating specific poll, update just that poll's data
                if (pollToUpdate) {
                    const updatedPollData = await aggregateVotes(query, pollToUpdate, tagFilter);
                    if (updatedPollData.length > 0) {
                        console.log('Updating poll:', pollToUpdate);
                        // Update the specific poll's count in cached data
                        const pollIndex = data.results.fullData.findIndex(([poll]) => poll === pollToUpdate);
                        if (pollIndex !== -1) {
                            data.results.fullData[pollIndex] = updatedPollData[0];
                            // Re-sort the data
                            data.results.fullData.sort((a, b) => b[1] - a[1]);
                        } else {
                            // append the new poll
                            data.results.fullData.push(updatedPollData[0]);
                        }

                        // await the cache update
                        await s3Client.send(new PutObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: CACHE_KEY,
                            Body: JSON.stringify(data),
                            ContentType: 'application/json'
                        }));

                        // send only the updated poll
                        return {
                            statusCode: 200,
                            body: JSON.stringify({
                                columns: ['poll', 'count'],
                                data: updatedPollData
                            })
                        }
                    } else {
                        console.log('No data found for poll to update:', pollToUpdate);
                    }
                }
                
                console.log('Cache hit - returning paginated selection from cached data');
                const selectedPolls = generateRandomSelection(
                    data.results.fullData,
                    seed,
                    limit,
                    offset
                );
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        columns: ['poll', 'count'],
                        data: selectedPolls
                    }),
                    headers: {
                        'X-Cache': 'HIT',
                        'X-Cache-Age': Math.round(cacheAge / 1000)
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
    const aggregatedData = await aggregateVotes(query, pollToUpdate, tagFilter);

    if (pollToUpdate) {
        // send response already
        return {
            statusCode: 200,
            body: JSON.stringify({
                columns: ['poll', 'count'],
                data: aggregatedData
            })
        }
    }
    
    // No need to filter again since we filtered during aggregation
    const filteredData = aggregatedData;
    
    // Cache the full result set
    const cacheObject = {
        timestamp: Date.now(),
        results: {
            columns: ['poll', 'count'],
            fullData: filteredData
        }
    };

    // Cache the results with timestamp
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CACHE_KEY,
        Body: JSON.stringify(cacheObject),
        ContentType: 'application/json'
    }));

    const selectedPolls = generateRandomSelection(
        filteredData,
        seed,
        limit,
        offset
    );

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

