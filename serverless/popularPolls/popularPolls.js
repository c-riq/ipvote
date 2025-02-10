// aws lambda function to get the most popular polls using athena

const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';
const CACHE_KEY = 'popular_polls/all_polls_cache.json';

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

async function aggregateAllPollsData(specificPoll = null) {
    // Get all vote data first
    const files = await listAllVoteFiles();
    const pollsData = new Map(); // Map to store vote counts for each poll
    const recentCounts = new Map(); // Map to store recent vote counts
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Process all vote files
    for (const file of files) {
        try {
            let pollFromPath = file.Key.split('/')[1]?.split('.')[0];
            pollFromPath = pollFromPath?.replace('poll=', '');
            if (!pollFromPath) continue;
            
            // Skip if we're looking for a specific poll and this isn't it
            if (specificPoll && pollFromPath !== specificPoll) continue;

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
                
                const [timestamp, , poll] = line.split(',');
                if (poll !== pollFromPath && poll !== pollFromPath.replace(/^open_/g, '')) continue;
                
                const currentCount = pollsData.get(pollFromPath) || 0;
                pollsData.set(pollFromPath, currentCount + 1);

                const voteTime = new Date(timestamp).getTime();
                if (voteTime >= sevenDaysAgo) {
                    const currentRecentCount = recentCounts.get(pollFromPath) || 0;
                    recentCounts.set(pollFromPath, currentRecentCount + 1);
                }
            }
        } catch (error) {
            console.error(`Error processing file ${file.Key}:`, error);
        }
    }

    // Get metadata for all polls (or just the specific poll)
    const pollMetadata = new Map();
    for (const pollName of pollsData.keys()) {
        try {
            const metadataPath = `metadata/poll=${pollName}/metadata.json`;
            const metadata = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: metadataPath
            }));
            const metadataContent = await metadata.Body.transformToString();
            pollMetadata.set(pollName, JSON.parse(metadataContent));
        } catch (error) {
            // If metadata doesn't exist, store empty metadata
            pollMetadata.set(pollName, { comments: [], tags: [] });
        }
    }

    // Combine all data
    const results = Array.from(pollsData.entries())
        .map(([poll, count]) => ({
            poll,
            count,
            last_7_days_count: recentCounts.get(poll) || 0,
            metadata: pollMetadata.get(poll)
        }))
        .sort((a, b) => b.count - a.count);

    return results;
}

module.exports.handler = async (event) => {
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    const pollToUpdate = event?.queryStringParameters?.pollToUpdate;
    const seed = parseInt(event?.queryStringParameters?.seed) || 1;
    const limit = parseInt(event?.queryStringParameters?.limit) || 15;
    const offset = parseInt(event?.queryStringParameters?.offset) || 0;
    const query = event?.queryStringParameters?.q || '';
    const tagFilter = event?.queryStringParameters?.tags || '';
    
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
                // Filter data based on query and tags
                let filteredData = data.results;
                
                // If updating specific poll, return only that poll's data
                if (pollToUpdate) {
                    // Get fresh data for just this poll
                    const freshData = await aggregateAllPollsData(pollToUpdate);
                    const freshPollData = freshData.filter(item => item.poll === pollToUpdate);
                    
                    if (freshPollData.length > 0) {
                        // Update the poll data in the cached results
                        const pollIndex = data.results.findIndex(item => item.poll === pollToUpdate);
                        if (pollIndex !== -1) {
                            data.results[pollIndex] = freshPollData[0];
                        } else {
                            data.results.push(freshPollData[0]);
                        }
                        
                        // Sort the data again
                        data.results.sort((a, b) => b.count - a.count);
                        
                        // Update the cache with the modified data object
                        await s3Client.send(new PutObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: CACHE_KEY,
                            Body: JSON.stringify(data),
                            ContentType: 'application/json'
                        }));
                    }
                    
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            columns: ['poll', 'count', 'last_7_days_count'],
                            data: freshPollData.map(item => [item.poll, item.count, item.last_7_days_count])
                        })
                    };
                }

                if (query) {
                    const searchTerms = query.toLowerCase().split(/\s+/);
                    filteredData = filteredData.filter(item => 
                        searchTerms.every(term => 
                            item.poll.toLowerCase().replace(/_/g, ' ').includes(term)
                        )
                    );
                }

                if (tagFilter) {
                    const tagFilters = tagFilter.toLowerCase().split(',');
                    filteredData = filteredData.filter(item => {
                        const pollTags = item.metadata?.tags || [];
                        const tagCounts = new Map();
                        pollTags.forEach(t => {
                            const tag = t.tag.toLowerCase();
                            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                        });
                        const topTags = Array.from(tagCounts.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 2)
                            .map(([tag]) => tag);
                        return tagFilters.some(tag => topTags.includes(tag));
                    });
                }

                const selectedPolls = generateRandomSelection(
                    filteredData.map(item => [item.poll, item.count, item.last_7_days_count]),
                    seed,
                    limit,
                    offset
                );

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        columns: ['poll', 'count', 'last_7_days_count'],
                        data: selectedPolls
                    }),
                    headers: {
                        'X-Cache': 'HIT',
                        'X-Cache-Age': Math.round(cacheAge / 1000)
                    }
                };
            }
        } catch (error) {
            console.log('Cache miss or error:', error.message);
        }
    }

    // Aggregate all data
    const aggregatedData = await aggregateAllPollsData();

    // Cache the full result set
    const cacheObject = {
        timestamp: Date.now(),
        results: aggregatedData
    };

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CACHE_KEY,
        Body: JSON.stringify(cacheObject),
        ContentType: 'application/json'
    }));

    // Filter and return results
    let filteredData = aggregatedData;
    if (query || tagFilter) {
        if (query) {
            const searchTerms = query.toLowerCase().split(/\s+/);
            filteredData = filteredData.filter(item => 
                searchTerms.every(term => 
                    item.poll.toLowerCase().replace(/_/g, ' ').includes(term)
                )
            );
        }

        if (tagFilter) {
            const tagFilters = tagFilter.toLowerCase().split(',');
            filteredData = filteredData.filter(item => {
                const pollTags = item.metadata?.tags || [];
                const tagCounts = new Map();
                pollTags.forEach(t => {
                    const tag = t.tag.toLowerCase();
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                });
                const topTags = Array.from(tagCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 2)
                    .map(([tag]) => tag);
                return tagFilters.some(tag => topTags.includes(tag));
            });
        }
    }

    const selectedPolls = generateRandomSelection(
        filteredData.map(item => [item.poll, item.count, item.last_7_days_count]),
        seed,
        limit,
        offset
    );

    return {
        statusCode: 200,
        body: JSON.stringify({
            columns: ['poll', 'count', 'last_7_days_count'],
            data: selectedPolls
        }),
        headers: {
            'X-Cache': 'MISS'
        }
    };
};

