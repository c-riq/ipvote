import { useState, useEffect } from 'react';
import { Typography, Paper, Box, Button, Stepper, Step, StepLabel, Alert, TextField } from '@mui/material';
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
  const [phoneNumber, setPhoneNumber] = useState('');

  // Check for successful Stripe payment on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const sessionId = urlParams.get('session_id');
    
    if (paymentStatus === 'success' && sessionId) {
      // Store session ID in localStorage
      localStorage.setItem('stripeSessionId', sessionId);
      
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
        window.history.replaceState({}, '', window.location.pathname);
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

  const handlePaymentStarted = async () => {
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

  const handlePhoneSubmit = async () => {
    const sessionId = localStorage.getItem('stripeSessionId');
    if (!sessionId) {
      setError('No valid session found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('https://a53qp2o22d2kljgnjqwux6n5dq0diats.lambda-url.us-east-1.on.aws/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          phoneNumber
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send verification code');
      }

      alert('Verification code sent to your phone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
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
          <>
            <Box sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Phone Number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                required
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                onClick={handlePhoneSubmit}
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Submit Phone Number'}
              </Button>
            </Box>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        ) : (
          <>
            <Typography variant="body2" paragraph>
              Verify your identity with a phone number. This requires a one-time payment of 1€.
            </Typography>
            <Button
              variant="contained"
              onClick={handlePaymentStarted}
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