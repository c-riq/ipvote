import { useState } from 'react';
import { Typography, Box, Button, TextField, Alert, CircularProgress } from '@mui/material';
import { AUTH_HOST } from '../../constants';
import WarningIcon from '@mui/icons-material/Warning';

interface AccountManagementProps {
  isSessionLoading: boolean;
  isLoggedIn: boolean;
  email: string;
  emailVerified: boolean;
  setEmail: (email: string) => void;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
  onLogout: () => void;
}

function AccountManagement({ 
  isSessionLoading, 
  isLoggedIn, 
  email, 
  emailVerified,
  setEmail,
  setIsLoggedIn,
  onLogout
}: AccountManagementProps) {
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validateEmail = (email: string) => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Invalid email format');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSignup = async () => {
    if (!validateEmail(email) || !validatePassword(password)) {
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(AUTH_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'signup',
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      localStorage.setItem('sessionToken', data.sessionToken);
      localStorage.setItem('userEmail', email);
      setIsLoggedIn(true);
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'An error occurred during signup');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validateEmail(email) || !validatePassword(password)) {
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(AUTH_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('sessionToken', data.sessionToken);
      localStorage.setItem('userEmail', email);
      setIsLoggedIn(true);
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    onLogout();
  };

  return (
    <Box sx={{ my: 2, pt: 2 }}>
      <Typography variant="h6">
        Account Management
      </Typography>
      
      {isSessionLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress />
        </Box>
      ) : !isLoggedIn ? (
        <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!emailError}
            helperText={emailError}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!passwordError}
            helperText={passwordError}
          />
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSignup}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Signing up...
                </>
              ) : (
                'Sign Up'
              )}
            </Button>
            
            <Button
              variant="outlined"
              onClick={handleLogin}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </Box>
          
          {authError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {authError}
            </Alert>
          )}
        </Box>
      ) : (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Logged in as: {email}
          </Typography>

          {!emailVerified && (
            <Alert 
              severity="warning" 
              icon={<WarningIcon />}
              sx={{ mt: 2, mb: 2 }}
            >
              Please verify your email address to enable all features. Check your inbox for the verification link.
            </Alert>
          )}

          <Button
            variant="outlined"
            color="secondary"
            onClick={handleLogout}
            sx={{ mt: 2 }}
          >
            Logout
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default AccountManagement; 