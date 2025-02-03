const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const twilio = require('twilio');

const s3Client = new S3Client();
const twilioClient = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

const fetchFileFromS3 = async (bucketName, key) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  const response = await s3Client.send(command);
  return streamToString(response.Body);
};

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.handler = async (event) => {
  console.log('Request received:', {
    method: event.requestContext?.http?.method,
    headers: event.headers,
  });

  if (event.requestContext?.http?.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { sessionId, phoneNumber } = body;

    if (!sessionId || !phoneNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Session ID and phone number are required' })
      };
    }

    // Check stripe sessions file
    const bucketName = 'ipvotes';
    const sessionsFile = 'payment/stripe_sessions.csv';
    
    const sessionsData = await fetchFileFromS3(bucketName, sessionsFile);
    const sessions = sessionsData.split('\n')
      .slice(1) // Skip header
      .map(line => {
        const [time, id, consumed] = line.split(',');
        return { time, id, consumed: parseInt(consumed) };
      });

    const sessionRecord = sessions.find(s => s.id === sessionId);
    
    if (!sessionRecord) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid session ID' })
      };
    }

    if (sessionRecord.consumed === 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Session already consumed' })
      };
    }

    // Generate and save verification code
    const verificationCode = generateVerificationCode();
    const timestamp = Date.now();
    
    // Save verification code
    const verificationFile = `phone_number/verification.csv`;
    let verificationData;
    
    try {
      verificationData = await fetchFileFromS3(bucketName, verificationFile);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        verificationData = 'time,phone,token\n';
      } else {
        throw error;
      }
    }

    const newRecord = `${timestamp},${phoneNumber},${verificationCode}\n`;
    const updatedData = (verificationData.endsWith('\n') ? verificationData : verificationData + '\n') + newRecord;

    // Save to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: verificationFile,
      Body: updatedData,
    }));

    // Send SMS
    await twilioClient.messages.create({
      body: `Your verification code is: ${verificationCode}`,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        message: 'Verification code sent'
      })
    };

  } catch (err) {
    console.error('Error sending SMS challenge:', {
      message: err.message,
      stack: err.stack
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error sending SMS challenge',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
}; 