import { GetObjectCommand } from '@aws-sdk/client-s3';
import { fetchFileFromS3, s3Client } from './s3Utils';

export const validateCachedCaptcha = async (ip: string, token: string, bucketName: string): Promise<boolean> => {
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

export const validatePhoneToken = async (phoneNumber: string, token: string, bucketName: string): Promise<boolean> => {
    const fileName = 'phone_number/verification.csv';
    const monthInMs = 31 * 24 * 60 * 60 * 1000; // One month in milliseconds
    
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
                // Verify that the token is not older than one month
                if (now - verificationTime < monthInMs) {
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error validating phone token:', error);
    }
    return false;
};

export const validateSessionToken = async (email: string, sessionToken: string): Promise<string | null> => {
    if (!email || !sessionToken) return null;
    
    const partition = email.charAt(0).toLowerCase();
    const userFilePath = `users/${partition}/users.json`;

    try {
        const command = new GetObjectCommand({
            Bucket: 'ipvote-auth',
            Key: userFilePath
        });
        const response = await s3Client.send(command);
        if (!response.Body) {
            throw new Error('Empty response body');
        }
        const data = await response.Body.transformToString();
        const users = JSON.parse(data);
        const user = users[email];

        if (!user || !user.sessions) return null;

        const currentTime = Math.floor(Date.now() / 1000);
        const isValidToken = user.sessions.some((token: string) => {
            const [tokenValue, expiry] = token.split('_');
            return token === sessionToken && parseInt(expiry) > currentTime;
        });

        return isValidToken ? user.userId : null;
    } catch (error) {
        console.error('Session validation error:', error);
        return null;
    }
};

export const checkIfPollDisabled = async (poll: string, bucketName: string): Promise<boolean> => {
    try {
        // Check for disabled file in the poll's root directory
        const disabledFilePath = `votes/poll=${poll}/disabled`;
        await fetchFileFromS3(bucketName, disabledFilePath);
        // If file exists (no error thrown), poll is disabled
        return true;
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
            return false;
        }
        // For other errors, log and assume poll is not disabled
        console.error('Error checking disabled status:', error);
        return false;
    }
}; 