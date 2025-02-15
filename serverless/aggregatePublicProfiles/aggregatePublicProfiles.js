const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client();
const PROFILES_BUCKET = 'ipvotes';

const fetchPublicProfile = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: PROFILES_BUCKET,
            Key: key,
        });
        const response = await s3Client.send(command);
        const data = await response.Body.transformToString();
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error fetching profile ${key}:`, error);
        return null;
    }
};

const calculateDelegationCounts = async () => {
    try {
        // List all delegation files
        const listCommand = new ListObjectsV2Command({
            Bucket: PROFILES_BUCKET,
            Prefix: 'delegation/',
        });
        
        const { Contents } = await s3Client.send(listCommand);
        const counts = {};
        
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
                const [, target] = line.split(',');
                counts[target] = (counts[target] || 0) + 1;
            }
        }
        
        return counts;
    } catch (error) {
        console.error('Error calculating delegation counts:', error);
        return {};
    }
};

exports.handler = async (event) => {
    try {
        // List all public profile files
        const listCommand = new ListObjectsV2Command({
            Bucket: PROFILES_BUCKET,
            Prefix: 'public_profiles/',
        });
        
        const { Contents } = await s3Client.send(listCommand);
        
        // Get delegation counts
        const delegationCounts = await calculateDelegationCounts();
        
        // Fetch and process all profiles
        const profiles = {};
        const profilePromises = Contents.map(async (item) => {
            if (item.Key === 'public_profiles/index.json') return; // Skip the index file
            
            const profile = await fetchPublicProfile(item.Key);
            if (!profile) return;
            
            const userId = item.Key.replace('public_profiles/', '').replace('.json', '');
            
            // Add profile to the collection with delegation count
            profiles[userId] = {
                settings: profile.settings,
                delegatedVotes: delegationCounts[userId] || 0,
                lastUpdated: profile.settings.lastUpdated || null
            };
        });
        
        await Promise.all(profilePromises);
        
        // Save the aggregated data
        const command = new PutObjectCommand({
            Bucket: PROFILES_BUCKET,
            Key: 'public_profiles/index.json',
            Body: JSON.stringify(profiles, null, 2),
            ContentType: 'application/json',
            CacheControl: 'max-age=300' // 5 minute cache
        });
        
        await s3Client.send(command);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Profile index updated successfully',
                profileCount: Object.keys(profiles).length
            })
        };
    } catch (error) {
        console.error('Aggregation error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to aggregate profiles',
                error: error.message
            })
        };
    }
}; 