import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { normalizeText } from './normalize';
import { S3ServiceException } from '@aws-sdk/client-s3';

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes';
const CACHE_KEY = 'popular_polls/all_polls_cache.json';

interface PollMetadata {
    comments: any[];
    tags: Array<{ tag: string }>;
}

interface PollData {
    poll: string;
    count: number;
    last_7_days_count: number;
    metadata: PollMetadata;
}

interface CacheData {
    timestamp: number;
    results: PollData[];
}

async function listAllVoteFiles() {
    const files: Array<{ Key: string }> = [];
    let continuationToken: string | undefined = undefined;
    
    do {
        const command: ListObjectsV2Command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'votes/',
            ContinuationToken: continuationToken
        });
        
        const response: ListObjectsV2CommandOutput = await s3Client.send(command);
        if (response.Contents) {
            files.push(...response.Contents.filter((obj): obj is { Key: string } => typeof obj.Key === 'string'));
        }
        continuationToken = (response as ListObjectsV2CommandOutput).NextContinuationToken;
    } while (continuationToken);
    
    return files;
}

function generateRandomSelection(
    fullData: Array<[string, number, number]>,
    seed: number,
    limit: number = 30,
    offset: number = 0
): Array<[string, number, number]> {
    // Use seed for consistent randomization
    const seededRandom = (seed: number): number => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    // Seeded shuffle function with boosting for recent activity
    const seededShuffle = (array: Array<[string, number, number]>, seed: number) => {
        let currentSeed = seed;
        const shuffled: Array<[string, number, number]> = [];
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

async function checkIfPollDisabled(poll: string): Promise<boolean> {
    try {
        await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: `votes/poll=${poll}/disabled`
        }));
        return true;
    } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        console.error(`Error checking disabled status for ${poll}:`, error);
        return false;
    }
}

async function aggregateAllPollsData(specificPoll: string | null = null): Promise<PollData[]> {
    // Get all vote data first
    const files = await listAllVoteFiles();
    const pollsData = new Map<string, number>();
    const recentCounts = new Map<string, number>();
    const sevenDaysAgo = (new Date()).getTime() - (7 * 24 * 60 * 60 * 1000);
    
    // Process all vote files
    for (const file of files) {
        try {
            let pollFromPath = file.Key.split('/')[1]?.split('.csv')[0];
            pollFromPath = pollFromPath?.replace('poll=', '');
            if (!pollFromPath) continue;
            
            // Skip if we're looking for a specific poll and this isn't it
            if (specificPoll && pollFromPath !== specificPoll) continue;

            // Skip disabled polls
            const isDisabled = await checkIfPollDisabled(pollFromPath);
            if (isDisabled) {
                console.log(`Skipping disabled poll: ${pollFromPath}`);
                continue;
            }

            const response = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: file.Key
            }));
            
            const content = await response.Body?.transformToString();
            if (!content) continue;

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
    const pollMetadata = new Map<string, PollMetadata>();
    for (const pollName of pollsData.keys()) {
        try {
            const metadataPath = `metadata/poll=${pollName}/metadata.json`;
            const metadata = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: metadataPath
            }));
            const metadataContent = await metadata.Body?.transformToString();
            if (metadataContent) {
                pollMetadata.set(pollName, JSON.parse(metadataContent));
            }
        } catch (error) {
            // If metadata doesn't exist, store empty metadata
            pollMetadata.set(pollName, { comments: [], tags: [] });
        }
    }

    // Combine all data
    const results = Array.from(pollsData.entries())
        .map(([poll, count]): PollData => ({
            poll,
            count,
            last_7_days_count: recentCounts.get(poll) || 0,
            metadata: pollMetadata.get(poll) || { comments: [], tags: [] }
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const forceRefresh = event.queryStringParameters?.refresh === 'true';
    let pollToUpdate = event.queryStringParameters?.pollToUpdate;
    
    // Only try to replace if pollToUpdate exists
    if (pollToUpdate) {
        pollToUpdate = pollToUpdate.replace(/,/g, '%2C');
        console.log('pollToUpdate:', pollToUpdate);
    }
    
    const seed = parseInt(event.queryStringParameters?.seed || '1');
    const limit = parseInt(event.queryStringParameters?.limit || '15');
    const offset = parseInt(event.queryStringParameters?.offset || '0');
    const query = event.queryStringParameters?.q || '';
    const tagFilter = event.queryStringParameters?.tags || '';
    
    // Try cache first if not forcing refresh
    if (!forceRefresh) {
        try {
            const cachedData = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: CACHE_KEY
            }));
            
            const cachedContent = await cachedData.Body?.transformToString();
            if (cachedContent) {
                const data: CacheData = JSON.parse(cachedContent);
                
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
                        const unescapePollTitle = (poll: string): string => poll.replace(/%2C/g, ',');

                        return {
                            statusCode: 200,
                            body: JSON.stringify({
                                columns: ['poll', 'count', 'last_7_days_count'],
                                data: freshPollData.map(item => [
                                    unescapePollTitle(item.poll),
                                    item.count,
                                    item.last_7_days_count
                                ])
                            }),
                            headers: {
                                'X-Cache': 'HIT',
                                'X-Cache-Age': Math.round(cacheAge / 1000).toString()
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
                            const tagCounts = new Map<string, number>();
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
                    const unescapePollTitle = (poll: string): string => poll.replace(/%2C/g, ',');

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
                            'X-Cache-Age': Math.round(cacheAge / 1000).toString()
                        }
                    };
                }
            }
        } catch (error) {
            console.log('Cache miss or error:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    // Aggregate all data
    const aggregatedData = await aggregateAllPollsData();

    // Cache the full result set
    const cacheObject: CacheData = {
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
                const tagCounts = new Map<string, number>();
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
    const unescapePollTitle = (poll: string): string => poll.replace(/%2C/g, ',');

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
