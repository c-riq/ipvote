import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export const s3Client = new S3Client();

export const streamToString = (stream: Readable): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

export const fetchFileFromS3 = async (bucketName: string, key: string): Promise<string> => {
    const getObjectParams = {
        Bucket: bucketName,
        Key: key,
    };
    
    const command = new GetObjectCommand(getObjectParams);
    const response = await s3Client.send(command);
    if (!response.Body) {
        throw new Error('Empty response body');
    }
    const fileContents = await streamToString(response.Body as Readable);
    return fileContents;
}; 