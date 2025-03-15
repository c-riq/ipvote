// aws lambda function to get the most popular polls using athena

const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { normalizeText } = require('./normalize');

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

    // Seeded shuffle function with boosting for recent activity
    const seededShuffle = (array, seed) => {
        let currentSeed = seed;
        const shuffled = [];
        const items = [...array];
        
        // Create boosted array where items with recent activity appear multiple times
        const boostedItems = items.flatMap(item => {
            const hasRecentActivity = item[2] > 0; // check last_7_days_count
            return hasRecentActivity ? Array(5).fill(item) : [item];
        });

        while (boostedItems.length > 0) {
            const index = Math.floor(seededRandom(currentSeed++) * boostedItems.length);
            shuffled.push(boostedItems[index]);
            boostedItems.splice(index, 1);
        }

        // Remove duplicates while maintaining order
        return [...new Map(shuffled.map(item => [item[0], item])).values()];
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
    const sevenDaysAgo = (new Date()).getTime() - (7 * 24 * 60 * 60 * 1000);
    
    // Process all vote files
    for (const file of files) {
        try {
            let pollFromPath = file.Key.split('/')[1]?.split('.csv')[0];
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

                const voteTime = new Date(parseInt(timestamp)).getTime();
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
        .sort((a, b) => {
            // First compare recent activity (with threshold of 2)
            const aHasRecent = a.last_7_days_count > 2;
            const bHasRecent = b.last_7_days_count > 2;
            if (aHasRecent !== bHasRecent) {
                return bHasRecent ? 1 : -1;
            }
            // If both have same recent activity status, sort by total count
            return b.count - a.count;
        });

    return results;
}

module.exports.handler = async (event) => {
    const forceRefresh = event?.queryStringParameters?.refresh === 'true';
    let pollToUpdate = event?.queryStringParameters?.pollToUpdate;
    // Only try to replace if pollToUpdate exists
    if (pollToUpdate) {
        pollToUpdate = pollToUpdate.replace(/,/g, '%2C');
        console.log('pollToUpdate:', pollToUpdate);
    }
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
                    
                    // Helper function to unescape poll titles
                    const unescapePollTitle = (poll) => poll.replace(/%2C/g, ',');

                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            columns: ['poll', 'count', 'last_7_days_count'],
                            data: freshPollData.map(item => [unescapePollTitle(item.poll), item.count, item.last_7_days_count])
                        }),
                        headers: {
                            'X-Cache': 'HIT',
                            'X-Cache-Age': Math.round(cacheAge / 1000)
                        }
                    };
                }

                if (query) {
                    const searchTerms = query.toLowerCase().split(/\s+/).map(term => normalizeText(term));
                    filteredData = filteredData.filter(item => 
                        searchTerms.every(term => 
                            normalizeText(item.poll.replace(/_/g, ' ')).includes(term)
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

                // Helper function to unescape poll titles
                const unescapePollTitle = (poll) => poll.replace(/%2C/g, ',');

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        columns: ['poll', 'count', 'last_7_days_count'],
                        data: selectedPolls.map(([poll, count, last_7_days]) => 
                            [unescapePollTitle(poll), count, last_7_days]
                        )
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
            const searchTerms = query.toLowerCase().split(/\s+/).map(term => normalizeText(term));
            filteredData = filteredData.filter(item => 
                searchTerms.every(term => 
                    normalizeText(item.poll.replace(/_/g, ' ')).includes(term)
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

    // Helper function to unescape poll titles
    const unescapePollTitle = (poll) => poll.replace(/%2C/g, ',');

    return {
        statusCode: 200,
        body: JSON.stringify({
            columns: ['poll', 'count', 'last_7_days_count'],
            data: selectedPolls.map(([poll, count, last_7_days]) => 
                [unescapePollTitle(poll), count, last_7_days]
            )
        }),
        headers: {
            'X-Cache': 'MISS'
        }
    };
};

