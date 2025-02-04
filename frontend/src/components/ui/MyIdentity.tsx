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
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean, captchaToken?: string) => void;
  captchaToken: string | undefined;
  setCaptchaToken: (token: string) => void;
}

function MyIdentity({ 
  userIpInfo,
  privacyAccepted,
  onPrivacyAcceptChange,
  captchaToken,
  setCaptchaToken 
}: MyIdentityProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [validatedPhoneNumber, setValidatedPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [verificationTime, setVerificationTime] = useState<string | null>(null);

  // Add effect to load stored verification on mount
  useEffect(() => {
    const storedVerification = localStorage.getItem('phoneVerification');
    if (storedVerification) {
      const verification = JSON.parse(storedVerification);
      // Check if verification is less than 24 hours old
      const isValid = new Date().getTime() - new Date(verification.timestamp).getTime() < 24 * 60 * 60 * 1000;
      if (isValid) {
        setValidatedPhoneNumber(verification.phoneNumber);
        setVerificationTime(verification.timestamp);
      } else {
        localStorage.removeItem('phoneVerification');
      }
    }
  }, []);

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
      completed: !!validatedPhoneNumber && privacyAccepted
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

      setShowVerificationInput(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSubmit = async () => {
    const sessionId = localStorage.getItem('stripeSessionId');
    if (!sessionId) {
      setError('No valid session found');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('https://acnd2kwmzq774ec53s4q6i7sfq0huotn.lambda-url.us-east-1.on.aws/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          phoneNumber,
          code: verificationCode
        })
      });

      if (!response.ok) {
        throw new Error('Failed to verify code');
      }

      const data = await response.json();
      
      // Store verification data
      const verificationData = {
        phoneNumber,
        token: data.verificationToken,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('phoneVerification', JSON.stringify(verificationData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code');
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
        <Stepper activeStep={validatedPhoneNumber ? 2 : userIpInfo ? 1 : 0}>
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
            showPrivacy={true}
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
        ) : validatedPhoneNumber ? (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success">
              Phone number verified successfully!
            </Alert>
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2">
                Verified Phone: {validatedPhoneNumber}
                <br />
                Verified on: {verificationTime && new Date(verificationTime).toLocaleString()}
              </Typography>
            </Box>
          </Box>
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
                disabled={showVerificationInput}
              />
              {!showVerificationInput ? (
                <Button
                  variant="contained"
                  onClick={handlePhoneSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Send Verification Code'}
                </Button>
              ) : (
                <>
                  <TextField
                    fullWidth
                    label="Verification Code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    required
                    sx={{ mb: 2 }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleVerificationSubmit}
                    disabled={isLoading || verificationCode.length !== 6}
                  >
                    {isLoading ? 'Verifying...' : 'Verify Code'}
                  </Button>
                </>
              )}
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