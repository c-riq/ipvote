import { useState, useEffect } from 'react';
import { Typography, Paper, Box, Button, Stepper, Step, StepLabel, 
    Alert, TextField, CircularProgress, Tooltip, FormControlLabel, Switch, Divider } from '@mui/material';
import { loadStripe } from '@stripe/stripe-js';
import { IpInfoResponse, PhoneVerificationState } from '../../App';
import { AUTH_HOST, CREATE_STRIPE_SESSION_HOST, SEND_SMS_CHALLENGE_HOST, 
    VALIDATE_STRIPE_SESSION_HOST, VERIFY_SMS_CHALLENGE_HOST } from '../../constants';
import PrivacyAccept from './PrivacyAccept';
import AccountManagement from './AccountManagement';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { countries } from '../../utils/countries';

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

interface UserSettings {
  isPolitician: boolean;
  firstName?: string;
  lastName?: string;
  country?: string;
  xUsername?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  lastUpdated?: string;
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

  // Add new state for authentication
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // Add new state for user settings
  const [userSettings, setUserSettings] = useState<UserSettings>({ isPolitician: false });
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  // Add new state for session loading
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // Add state for form validation
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Add state for tracking form changes
  const [pendingSettings, setPendingSettings] = useState<UserSettings | null>(null);

  const [emailVerified, setEmailVerified] = useState<boolean>(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
      label: 'Account',
      description: '',
      completed: isLoggedIn
    },
    {
      label: 'Phone number',
      description: '',
      completed: !!validatedPhoneNumber && privacyAccepted
    },
    {
      label: 'Public Profile',
      description: '',
      completed: isLoggedIn && userSettings.isPolitician
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


      // Update auth server with phone verification
      const sessionToken = localStorage.getItem('sessionToken');
      const userEmail = localStorage.getItem('userEmail');
      
      if (sessionToken && userEmail) {
        const authResponse = await fetch(AUTH_HOST, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'updatePhoneVerification',
            email: userEmail,
            sessionToken,
            phoneData: verificationData
          }),
        });

        if (!authResponse.ok) {
          throw new Error('Failed to update auth server with phone verification');
        }
      }
      
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

  // Add helper function to sync phone verification
  const syncPhoneVerification = async (email: string, sessionToken: string) => {
    const storedVerification = localStorage.getItem('phoneVerification');
    if (!storedVerification) return;

    try {
      const verificationData = JSON.parse(storedVerification);
      const authResponse = await fetch(AUTH_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'updatePhoneVerification',
          email,
          sessionToken,
          phoneData: verificationData
        }),
      });

      if (!authResponse.ok) {
        console.error('Failed to sync phone verification with auth server');
      }
    } catch (error) {
      console.error('Error syncing phone verification:', error);
    }
  };

  // Update the session check useEffect
  useEffect(() => {
    const checkSession = async () => {
      setIsSessionLoading(true);
      const sessionToken = localStorage.getItem('sessionToken');
      const storedEmail = localStorage.getItem('userEmail');
      if (!sessionToken || !storedEmail) {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userId');
        setIsSessionLoading(false);
        return;
      }

      try {
        const response = await fetch(AUTH_HOST, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'verifySessionToken',
            sessionToken,
            email: storedEmail
          }),
        });

        const data = await response.json();
        
        if (response.ok) {
          setIsLoggedIn(true);
          setEmail(storedEmail);
          setUserSettings(data.settings);
          setEmailVerified(data.emailVerified);
          localStorage.setItem('userId', data.userId);

          // If no phone verification in response but exists in localStorage, sync it
          if (!data.phoneVerification && localStorage.getItem('phoneVerification')) {
            await syncPhoneVerification(storedEmail, sessionToken);
          }
        } else {
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userId');
        }
      } catch (err) {
        console.error('Session verification failed:', err);
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userId');
      } finally {
        setIsSessionLoading(false);
      }
    };

    checkSession();
  }, []);


  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');  // Also remove userId on logout
    setIsLoggedIn(false);
    setEmail('');
  };

  // Update the settings update handler to handle batch updates
  const handleSettingsUpdate = async (newSettings: Partial<UserSettings>) => {
    setIsSettingsLoading(true);
    setSettingsError(null);

    try {
      const sessionToken = localStorage.getItem('sessionToken');
      const userEmail = localStorage.getItem('userEmail');

      if (!sessionToken || !userEmail) {
        throw new Error('No valid session');
      }

      const response = await fetch(AUTH_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'updateSettings',
          email: userEmail,
          sessionToken,
          settings: newSettings
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update settings');
      }

      setUserSettings(data.settings);
      setPendingSettings(null); // Clear pending changes after successful update
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSettingsLoading(false);
    }
  };

  // Update the politician mode change handler to update immediately
  const handlePoliticianModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleSettingsUpdate({ 
      ...(pendingSettings || userSettings),
      isPolitician: event.target.checked 
    });
  };

  // Add handler for input changes
  const handleInputChange = (field: keyof UserSettings, value: string) => {
    setPendingSettings(prev => ({
      ...(prev || userSettings),
      [field]: value
    }));
  };

  // Add handler for save button
  const handleSaveChanges = () => {
    if (pendingSettings) {
      handleSettingsUpdate(pendingSettings);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        My Identity
      </Typography>

      <Box sx={{ my: 4 }}>
        <Stepper 
          activeStep={
            validatedPhoneNumber ? 3 : 
            isLoggedIn ? 2 : 
            userIpInfo ? 1 : 0
          }
          orientation={isMobile ? 'vertical' : 'horizontal'}
          sx={{ 
            '& .MuiStepLabel-label': {
              typography: 'body2',
            },
            '& .MuiStepLabel-iconContainer': {
              pr: { xs: 1, sm: 2 }
            }
          }}
        >
          {steps.map((step, index) => (
            <Step key={index} completed={step.completed}>
              <StepLabel>
                {step.label}
                {step.description && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {step.description}
                  </Typography>
                )}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {userIpInfo && (
        <>
          <Divider sx={{ my: 4 }}>
            <Typography variant="h6" color="text.secondary">Level 1: IP Address Information</Typography>
          </Divider>

          <Box sx={{ my: 3 }}>
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
              <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="body2">
                  IP Address: {userIpInfo.ip}
                  <br />
                  Country: {userIpInfo.geo.country_name}
                  <br />
                  Network: {userIpInfo.geo.as_name}
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 4 }}>
            <Typography variant="h6" color="text.secondary">Level 2: Account</Typography>
          </Divider>

          <Box sx={{ my: 3 }}>
            {!privacyAccepted ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                Please accept the privacy policy to proceed with account creation or login.
              </Alert>
            ) : (
              <AccountManagement
                isSessionLoading={isSessionLoading}
                isLoggedIn={isLoggedIn}
                email={email}
                emailVerified={emailVerified}
                setEmailVerified={setEmailVerified}
                setEmail={setEmail}
                setIsLoggedIn={setIsLoggedIn}
                onLogout={handleLogout}
                setUserSettings={setUserSettings}
              />
            )}
          </Box>

          <Divider sx={{ my: 4 }}>
            <Typography variant="h6" color="text.secondary">Level 3: Phone Verification</Typography>
          </Divider>

          <Box sx={{ my: 3 }}>
            {!isLoggedIn ? (
              <Alert severity="info">
                Please create an account or log in to verify your phone number.
              </Alert>
            ) : !privacyAccepted ? (
              <Alert severity="info">
                Please accept the privacy policy first to proceed with phone verification.
              </Alert>
            ) : validatedPhoneNumber ? (
              <Box sx={{ mt: 2 }}>
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
                  Verify your phone number for 1€ to increase the credibility of your votes for 1 month.
                  <br /> With a verified phone number, you can also add tags to polls.
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
              </>
            )}
          </Box>

          <Divider sx={{ my: 4 }}>
            <Typography variant="h6" color="text.secondary">Level 4: Public Profile</Typography>
          </Divider>

          <Box sx={{ my: 3 }}>
            {!isLoggedIn ? (
              <Alert severity="info">
                Please create an account or log in to set up your public profile.
              </Alert>
            ) : !validatedPhoneNumber ? (
              <Alert severity="info">
                Please verify your phone number to enable public profile features.
              </Alert>
            ) : (
              <Box sx={{ mt: 4, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                {/* Politician Mode Switch */}
                <FormControlLabel
                  control={
                    <Switch
                      checked={pendingSettings?.isPolitician ?? userSettings.isPolitician}
                      onChange={handlePoliticianModeChange}
                      disabled={isSettingsLoading}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">Enable Public Profile</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Make your votes public and allow other users to delegate their votes to you
                      </Typography>
                    </Box>
                  }
                />

                {/* Show profile fields only when public profile is enabled */}
                {(pendingSettings?.isPolitician || userSettings.isPolitician) && (
                  <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="First Name"
                      value={pendingSettings?.firstName ?? userSettings.firstName ?? ''}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      disabled={isSettingsLoading}
                      required
                    />
                    
                    <TextField
                      label="Last Name"
                      value={pendingSettings?.lastName ?? userSettings.lastName ?? ''}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      disabled={isSettingsLoading}
                      required
                    />
                    
                    <TextField
                      select
                      label="Country"
                      value={pendingSettings?.country ?? userSettings.country ?? ''}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      disabled={isSettingsLoading}
                      required
                      SelectProps={{
                        native: true,
                      }}
                    >
                      <option value="">Select a country</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </TextField>
                    
                    <TextField
                      label="X (Twitter) Username"
                      value={pendingSettings?.xUsername ?? userSettings.xUsername ?? ''}
                      onChange={(e) => handleInputChange('xUsername', e.target.value)}
                      disabled={isSettingsLoading}
                      helperText="Without the @ symbol"
                    />
                    
                    <TextField
                      label="LinkedIn URL"
                      value={pendingSettings?.linkedinUrl ?? userSettings.linkedinUrl ?? ''}
                      onChange={(e) => handleInputChange('linkedinUrl', e.target.value)}
                      disabled={isSettingsLoading}
                      helperText="Full LinkedIn profile URL"
                    />
                    
                    <TextField
                      label="Website URL"
                      value={pendingSettings?.websiteUrl ?? userSettings.websiteUrl ?? ''}
                      onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
                      disabled={isSettingsLoading}
                      helperText="Your personal or professional website"
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleSaveChanges}
                        disabled={isSettingsLoading || !pendingSettings}
                        startIcon={isSettingsLoading ? <CircularProgress size={20} /> : null}
                      >
                        {isSettingsLoading ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {settingsError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {settingsError}
                  </Alert>
                )}
                
                {userSettings.lastUpdated && (
                  <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                    Last updated: {new Date(userSettings.lastUpdated).toLocaleString()}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </>
      )}

    </Paper>
  );
}

export default MyIdentity; 