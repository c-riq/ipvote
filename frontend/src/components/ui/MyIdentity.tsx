import { useState, useEffect } from 'react';
import { Typography, Paper, Box, Button, Stepper, Step, StepLabel, 
    Alert, TextField, CircularProgress, Tooltip } from '@mui/material';
import { loadStripe } from '@stripe/stripe-js';
import { IpInfoResponse, PhoneVerificationState } from '../../App';
import { CREATE_STRIPE_SESSION_HOST, SEND_SMS_CHALLENGE_HOST, 
    VALIDATE_STRIPE_SESSION_HOST, VERIFY_SMS_CHALLENGE_HOST } from '../../constants';
import PrivacyAccept from './PrivacyAccept';

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

interface MyIdentityProps {
  userIpInfo: IpInfoResponse | null;
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean, captchaToken?: string) => void;
  captchaToken: string | undefined;
  setCaptchaToken: (token: string) => void;
  phoneVerification: PhoneVerificationState | null;
  setPhoneVerification: (phoneVerification: PhoneVerificationState | null) => void;
}

function MyIdentity({ 
  userIpInfo,
  privacyAccepted,
  onPrivacyAcceptChange,
  captchaToken,
  setCaptchaToken,
  phoneVerification,
  setPhoneVerification
}: MyIdentityProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [validatedPhoneNumber, setValidatedPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [verificationTime, setVerificationTime] = useState<string | null>(null);

  // Update local state when phoneVerification prop changes
  useEffect(() => {
    if (phoneVerification) {
      setValidatedPhoneNumber(phoneVerification.phoneNumber);
      setVerificationTime(phoneVerification.timestamp);
    } else {
      setValidatedPhoneNumber('');
      setVerificationTime(null);
    }
  }, [phoneVerification]);

  // Check for successful Stripe payment on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const sessionId = urlParams.get('session_id');
    
    if (paymentStatus === 'success' && sessionId) {
      // Store session ID in localStorage
      localStorage.setItem('stripeSessionId', sessionId);
      
      setIsLoading(true); // Add loading state while validating
      fetch(VALIDATE_STRIPE_SESSION_HOST, {
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
      })
      .finally(() => {
        setIsLoading(false); // Clear loading state when done
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
      const response = await fetch(SEND_SMS_CHALLENGE_HOST, {
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

  // Add phone number validation function
  const isValidPhoneNumber = (phone: string) => {
    // Check if phone number starts with + and country code
    return /^\+\d{1,4}[0-9\s.-]{6,}$/.test(phone);
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
      const response = await fetch(VERIFY_SMS_CHALLENGE_HOST, {
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
      
      const verificationData = {
        phoneNumber: data.phoneNumber,
        token: data.verificationToken,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('phoneVerification', JSON.stringify(verificationData));
      setPhoneVerification(verificationData);  // Update the parent state
      
      setShowVerificationInput(false);
      setShowPhoneInput(false);
      localStorage.removeItem('stripeSessionId');
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
                disabled={showVerificationInput || isLoading}
                helperText="Include country code (e.g., +1 for USA)"
              />
              {!showVerificationInput ? (
                <Tooltip 
                  title={!isValidPhoneNumber(phoneNumber) ? "Please include country code (e.g., +1 for USA)" : ""}
                  arrow
                >
                  <span>
                    <Button
                      variant="contained"
                      onClick={handlePhoneSubmit}
                      disabled={isLoading || !phoneNumber || !isValidPhoneNumber(phoneNumber)}
                    >
                      {isLoading ? (
                        <>
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                          Sending...
                        </>
                      ) : (
                        'Send Verification Code'
                      )}
                    </Button>
                  </span>
                </Tooltip>
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
                    disabled={isLoading}
                    helperText="Enter the 6-digit code sent to your phone"
                  />
                  <Tooltip 
                    title={verificationCode.length !== 6 ? "Please enter all 6 digits of the verification code" : ""}
                    arrow
                  >
                    <span>
                      <Button
                        variant="contained"
                        onClick={handleVerificationSubmit}
                        disabled={isLoading || verificationCode.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <CircularProgress size={20} sx={{ mr: 1 }} />
                            Verifying...
                          </>
                        ) : (
                          'Verify Code'
                        )}
                      </Button>
                    </span>
                  </Tooltip>
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
              Verify your phone number for 1€ to increase the credibility of your votes for 24 hours.
            </Typography>
            <Button
              variant="contained"
              onClick={handlePaymentStarted}
              disabled={isLoading || !userIpInfo}
            >
              {isLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Processing...
                </>
              ) : (
                'Verify Phone Number (1€)'
              )}
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