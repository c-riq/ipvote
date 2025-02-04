const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const twilio = require('twilio');
const crypto = require('crypto');

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

const updateSessionInS3 = async (bucketName, key, sessions) => {
  const csvContent = ['timestamp,session_id,consumed\n']
    .concat(sessions.map(s => `${s.time},${s.id},${s.consumed}`))
    .join('\n');

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: csvContent,
    ContentType: 'text/csv'
  });

  await s3Client.send(command);
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const storeVerificationToken = async (bucketName, phoneNumber, token) => {
  const key = `phone_number/verification.csv`;
  let existingData = '';
  
  try {
    existingData = await fetchFileFromS3(bucketName, key);
  } catch (error) {
    // File doesn't exist yet, start with header
    existingData = 'time,phone,token\n';
  }

  // Ensure existing content ends with newline
  const normalizedData = existingData.endsWith('\n') ? existingData : existingData + '\n';
  
  const timestamp = new Date().getTime();
  const newEntry = `${timestamp},${phoneNumber},${token}\n`;
  const updatedContent = normalizedData + newEntry;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: updatedContent,
    ContentType: 'text/csv'
  });

  await s3Client.send(command);
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
    const { sessionId, phoneNumber, code } = body;

    if (!sessionId || !phoneNumber || !code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Session ID, phone number, and verification code are required' })
      };
    }

    // Check stripe sessions file
    const bucketName = 'ipvotes';
    const sessionsFile = 'payment/stripe_sessions.csv';
    
    const sessionsData = await fetchFileFromS3(bucketName, sessionsFile);
    const sessions = sessionsData.split('\n')
      .slice(1) // Skip header
      .filter(line => line.trim()) // Filter out empty lines
      .map(line => {
        const [time, id, consumed] = line.split(',');
        return {
          time: time || '',
          id: id || '',
          consumed: consumed ? parseInt(consumed, 10) || 0 : 0
        };
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

    try {
      // Verify the code using Twilio Verify API
      const verification = await twilioClient.verify.v2
        .services(process.env.VERIFY_SERVICE_SID)
        .verificationChecks.create({
          to: phoneNumber,
          code: code
        });

      if (verification.status === 'approved') {
        // Generate and store verification token
        const verificationToken = generateToken();
        await storeVerificationToken(bucketName, phoneNumber, verificationToken);
        
        // Update session as consumed
        sessionRecord.consumed = 1;
        await updateSessionInS3(bucketName, sessionsFile, sessions);

        return {
          statusCode: 200,
          body: JSON.stringify({
            status: 'success',
            message: 'Phone number verified successfully',
            verificationToken: verificationToken
          })
        };
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({
            status: 'failed',
            message: 'Invalid verification code'
          })
        };
      }

    } catch (err) {
      console.error('Error verifying code:', {
        message: err.message,
        stack: err.stack
      });
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Error verifying code',
          message: err instanceof Error ? err.message : 'Unknown error'
        })
      };
    }

  } catch (err) {
    console.error('Error in verification process:', {
      message: err.message,
      stack: err.stack
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error in verification process',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
}; 
