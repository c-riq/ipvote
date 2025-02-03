import { useState, useEffect } from 'react';
import { Typography, Paper, Box, Button, Stepper, Step, StepLabel, Alert } from '@mui/material';
import { loadStripe } from '@stripe/stripe-js';
import { IpInfoResponse } from '../../App';
import { CREATE_STRIPE_SESSION_HOST } from '../../constants';
import PrivacyAccept from './PrivacyAccept';

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

interface MyIdentityProps {
  userIpInfo: IpInfoResponse | null;
  phoneVerified: boolean;
  onPhoneVerified: () => void;
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean, captchaToken?: string) => void;
  captchaToken: string | undefined;
  setCaptchaToken: (token: string) => void;
}

function MyIdentity({ 
  userIpInfo, 
  phoneVerified, 
  // @ts-ignore
  onPhoneVerified,
  privacyAccepted,
  onPrivacyAcceptChange,
  captchaToken,
  setCaptchaToken 
}: MyIdentityProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  // Check for successful Stripe payment on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const sessionId = urlParams.get('session_id');
    
    if (paymentStatus === 'success' && sessionId) {
      // Validate the session with backend
      fetch('https://2hsykhxggic633voycp33xxwam0ijpvp.lambda-url.us-east-1.on.aws', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to validate session');
        }
        return response.json();
      })
      .then(() => {
        // Clear the URL parameters
        window.history.replaceState({}, '', window.location.pathname);
        // Show phone verification input
        setShowPhoneInput(true);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to validate payment');
      });
    } else if (paymentStatus === 'failed') {
      setError('Payment failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const steps = [
    {
      label: 'IP Address',
      description: '',
      completed: !!userIpInfo && privacyAccepted
    },
    {
      label: 'Phone number',
      description: '',
      completed: phoneVerified && privacyAccepted
    }
  ];

  const handlePhoneVerification = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Create a payment session
      const response = await fetch(CREATE_STRIPE_SESSION_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create verification session');
      }

      const { sessionId } = await response.json();
      const stripe = await stripePromise;

      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      // Redirect to Stripe payment page
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        My Identity
      </Typography>

      <Box sx={{ my: 4 }}>
        <Stepper activeStep={phoneVerified ? 2 : userIpInfo ? 1 : 0}>
          {steps.map((step, index) => (
            <Step key={index} completed={step.completed}>
              <StepLabel>
                <Typography variant="body2">{step.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {step.description}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {userIpInfo && (
        <>
          <PrivacyAccept
            userIpInfo={userIpInfo}
            accepted={privacyAccepted}
            onAcceptChange={onPrivacyAcceptChange}
            setCaptchaToken={setCaptchaToken}
            captchaToken={captchaToken}
            showCaptcha={false}
          />

          {privacyAccepted && (
            <Box sx={{ my: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h6" gutterBottom>
                Level 1: IP Address Information
              </Typography>
              <Typography variant="body2">
                IP Address: {userIpInfo.ip}
                <br />
                Country: {userIpInfo.geo.country_name}
                <br />
                Network: {userIpInfo.geo.as_name}
              </Typography>
            </Box>
          )}
        </>
      )}

      <Box sx={{ my: 3 }}>
        <Typography variant="h6" gutterBottom>
          Level 2: Phone Verification
        </Typography>
        {!privacyAccepted ? (
          <Alert severity="info">
            Please accept the privacy policy first to proceed with phone verification.
          </Alert>
        ) : phoneVerified ? (
          <Alert severity="success">
            Phone number verified successfully!
          </Alert>
        ) : showPhoneInput ? (
          <Alert severity="info">
            Payment successful! Phone verification form will be implemented here.
          </Alert>
        ) : (
          <>
            <Typography variant="body2" paragraph>
              Verify your identity with a phone number. This requires a one-time payment of 1€.
            </Typography>
            <Button
              variant="contained"
              onClick={handlePhoneVerification}
              disabled={isLoading || !userIpInfo}
            >
              {isLoading ? 'Processing...' : 'Verify Phone Number (1€)'}
            </Button>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}

export default MyIdentity; 