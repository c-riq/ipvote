const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const PROFILES_BUCKET = 'ipvotes';
const AUTH_BUCKET = 'ipvote-auth';

// Helper function to fetch file from S3
const fetchFileFromS3 = async (bucket, key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return data;
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            return null;
        }
        throw error;
    }
};

// Helper function to get user data by userId
const getUserByUserId = async (userId) => {
    // We'll need to scan through user files to find the matching userId
    for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
        const partition = String.fromCharCode(c);
        const userFilePath = `users/${partition}/users.json`;
        const usersData = await fetchFileFromS3(AUTH_BUCKET, userFilePath);
        if (!usersData) continue;
        
        const users = JSON.parse(usersData);
        for (const [email, user] of Object.entries(users)) {
            if (user.userId === userId) {
                return {
                    ...user,
                    email: email
                };
            }
        }
    }
    return null;
};

exports.handler = async (event) => {
    try {
        // List all delegation files
        const listCommand = new ListObjectsV2Command({
            Bucket: PROFILES_BUCKET,
            Prefix: 'delegation/',
        });
        
        const { Contents } = await s3Client.send(listCommand);
        const delegations = [];
        
        // Process each delegation file
        for (const item of Contents) {
            if (!item.Key.endsWith('.csv')) continue;
            
            const command = new GetObjectCommand({
                Bucket: PROFILES_BUCKET,
                Key: item.Key,
            });
            
            const response = await s3Client.send(command);
            const data = await response.Body.transformToString();
            
            // Process CSV content
            const lines = data.split('\n').filter(line => line.trim());
            for (const line of lines) {
                if (line === 'source,target,category,time') continue; // Skip header
                const [source, target, category, timestamp] = line.split(',');
                delegations.push({ source, target, category, timestamp });
            }
        }
        
        // Create a timestamp-based folder structure (YYYY/MM/DD)
        const now = new Date();
        const dateFolder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;
        
        // Process delegations into a compact graph structure
        // For each source-category pair, keep only the most recent delegation
        const latestDelegations = {};
        for (const del of delegations) {
            const key = `${del.source}|${del.category}`;
            if (!latestDelegations[key] || parseInt(del.timestamp) > parseInt(latestDelegations[key].timestamp)) {
                latestDelegations[key] = del;
            }
        }
        
        // Convert to final graph structure with phone verification data
        const graph = {};
        const uniqueUserIds = new Set();
        
        // Collect all unique userIds
        for (const key in latestDelegations) {
            const del = latestDelegations[key];
            uniqueUserIds.add(del.source);
            uniqueUserIds.add(del.target);
        }
        
        // Fetch user data for all unique userIds
        const userDataMap = new Map();
        for (const userId of uniqueUserIds) {
            const userData = await getUserByUserId(userId);
            if (userData) {
                userDataMap.set(userId, userData);
            }
        }
        
        // Build the graph with user data
        for (const key in latestDelegations) {
            const del = latestDelegations[key];
            if (!graph[del.source]) {
                const sourceUser = userDataMap.get(del.source);
                graph[del.source] = {
                    delegations: {},
                    phoneNumber: sourceUser?.phoneVerification?.phoneNumber || null
                };
            }
            graph[del.source].delegations[del.category] = {
                target: del.target,
                targetPhone: userDataMap.get(del.target)?.phoneVerification?.phoneNumber || null
            };
        }
        
        // Save different versions of the graph
        const versions = ['latest', dateFolder];
        for (const version of versions) {
            const command = new PutObjectCommand({
                Bucket: PROFILES_BUCKET,
                Key: `delegationGraph/${version}/full.json`,
                Body: JSON.stringify(graph),
                ContentType: 'application/json',
                CacheControl: 'max-age=300' // 5 minute cache
            });
            
            await s3Client.send(command);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Delegation graph generated successfully',
                date: dateFolder,
                nodeCount: Object.keys(graph).length,
                delegationCount: Object.keys(latestDelegations).length
            })
        };
    } catch (error) {
        console.error('Graph generation error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to generate delegation graph',
                error: error.message
            })
        };
    }
}; 