// test aws lambda function

const { handler } = require('./processVote');
const { Readable } = require('stream');


jest.mock('@aws-sdk/client-s3', () => {
    return {
        S3Client: jest.fn(() => ({
            send: jest.fn().mockResolvedValue({
                Body: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('time,ip,vote\n'));
                        }
                        if (event === 'end') {
                            callback();
                        }
                    })
                }
            })
        })),
        GetObjectCommand: jest.fn(),
        PutObjectCommand: jest.fn()
    };
});

describe('processVote', () => {
    it('should save vote to s3', async () => {
        const event = {
            queryStringParameters: {vote: 'b', poll: 'a_or_b'},
            requestContext: {http : {sourceIp: '::1'}}
        };
        const response = await handler(event);
        expect(response.statusCode).toBe(500);
    });
    it('should return 400 if vote or poll are missing', async () => {
        const event = {
            queryStringParameters: {vote: 'b'},
            requestContext: {http : {sourceIp: '::1'}}
        };
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
    });

});

