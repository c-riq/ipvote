const Stripe = require('stripe');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const s3Client = new S3Client();

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

const fetchFileFromS3 = async (bucketName, key) => {
  console.log('Fetching file from S3:', { bucketName, key });
  const getObjectParams = {
    Bucket: bucketName,
    Key: key,
  };
  const command = new GetObjectCommand(getObjectParams);
  const response = await s3Client.send(command);
  const fileContents = await streamToString(response.Body);
  console.log('File contents retrieved:', {
    size: fileContents.length,
    firstLine: fileContents.split('\n')[0]
  });
  return fileContents;
};

exports.handler = async (event) => {
  console.log('Request received:', {
    method: event.requestContext?.http?.method,
    headers: event.headers,
    bodyLength: event.body?.length
  });

  if (event.requestContext?.http?.method !== 'POST') {
    console.log('Invalid method:', event.requestContext?.http?.method);
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const sessionId = body.sessionId;

    if (!sessionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Session ID is required' })
      };
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log('Session status retrieved:', {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status
    });

    // Check if the payment was successful
    if (session.payment_status === 'paid') {
      const bucketName = 'ipvotes';
      const fileName = 'payment/stripe_sessions.csv';
      const timestamp = Date.now();

      // Fetch existing file or create new one
      let data = '';
      try {
        data = await fetchFileFromS3(bucketName, fileName);
        const sessions = data.split('\n').map(line => line.split(',')[1]);
        
        if (sessions.includes(sessionId)) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              status: 'already_recorded',
              session: session
            })
          };
        }
      } catch (error) {
        if (error.name === 'NoSuchKey') {
          console.log('Creating new session file');
          data = 'time,session_id,is_consumed\n';
        } else {
          console.error('Error fetching file:', {
            error: error.message,
            name: error.name,
            stack: error.stack
          });
          throw error;
        }
      }

      // Add new session record
      const newRecord = `${timestamp},${session.id},0\n`;
      const updatedData = (data.endsWith('\n') ? data : data + '\n') + newRecord;

      console.log('Saving session record:', {
        timestamp,
        sessionId: session.id,
        fileSize: updatedData.length
      });

      // Save to S3
      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: updatedData,
      });
      await s3Client.send(putCommand);

      console.log('Payment session recorded successfully:', {
        session_id: session.id,
        timestamp: new Date(timestamp).toISOString(),
        bucket: bucketName,
        file: fileName
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        session: session
      })
    };
  } catch (err) {
    console.error('Session check error:', {
      message: err.message,
      stack: err.stack
    });
    
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Session check error',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
};
