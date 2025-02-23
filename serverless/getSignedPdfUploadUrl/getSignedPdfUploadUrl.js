const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client();
const BUCKET_NAME = 'ipvotes'; // Use the same bucket as other functions
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

exports.handler = async (event) => {
    try {
        // get hash from URL params
        const hash = event?.queryStringParameters?.hash;
        
        if (!hash) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Hash parameter is required'
                }),
            };
        }

        const key = `poll_attachments/${hash}.pdf`;

        // Check if file already exists
        try {
            await s3Client.send(new HeadObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
            }));
            // If we reach here, file exists
            return {
                statusCode: 409,
                body: JSON.stringify({
                    message: 'File already exists'
                }),
            };
        } catch (error) {
            // File doesn't exist, continue with URL generation
            if (error.name !== 'NotFound') {
                throw error; // Re-throw if it's a different error
            }
        }

        // Create command for S3 put operation
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: 'application/pdf',
            Conditions: [
                ['content-length-range', 0, MAX_FILE_SIZE], // Restrict file size
                ['eq', '$Content-Type', 'application/pdf'], // Ensure content type matches
            ],
        });

        // Generate signed URL (valid for 15 minutes)
        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 900, // 15 minutes in seconds
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                uploadUrl: signedUrl,
                key: key,
            }),
        };
    } catch (error) {
        console.error('Error generating signed URL:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error generating signed URL',
                error: error.message,
            }),
        };
    }
}; 
