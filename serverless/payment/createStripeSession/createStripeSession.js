const Stripe = require('stripe');

console.log(process.env.STRIPE_SECRET_KEY, 'process.env.STRIPE_SECRET_KEY ');

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.requestContext.http.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/ui/identity?payment_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/ui/identity?payment_status=failed&session_id={CHECKOUT_SESSION_ID}`
    });

    // Return the session ID
    return {
      statusCode: 200,
      body: JSON.stringify({ sessionId: session.id })
    };
  } catch (error) {
    console.error('Stripe session creation error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create verification session',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}; 