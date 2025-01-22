import { FormControlLabel, Checkbox, CircularProgress } from '@mui/material'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { useState, useCallback } from 'react'

interface PrivacyAcceptProps {
  userIp: string | null
  accepted: boolean
  onAcceptChange: (accepted: boolean) => void
  setCaptchaToken: (token: string, ip: string, timestamp: string) => void
  captchaToken: string | undefined
  textAlign?: 'left' | 'center' | 'right'
}

function maskIP(ip: string) {
  if (!ip) return '';
  if (ip.includes('.')) {
    // IPv4
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.XXX`;
  } else {
    // IPv6
    const parts = ip.split(':');
    const thirdOctet = parts[2] || '';
    const paddedThird = thirdOctet.padStart(4, '0');
    const maskedThird = paddedThird.substring(0, 2) + 'XX';
    return `${parts[0]}:${parts[1]}:${maskedThird}:XXXX:XXXX:XXXX`;
  }
}

function PrivacyAccept({ userIp, accepted, onAcceptChange, setCaptchaToken, captchaToken, textAlign = 'left' }: PrivacyAcceptProps) {
  const [privacyChecked, setPrivacyChecked] = useState(accepted);

  const handlePrivacyChange = useCallback((checked: boolean) => {
    setPrivacyChecked(checked);
    onAcceptChange(checked);
  }, [onAcceptChange]);

  const handleHCaptchaVerify = useCallback((token: string) => {
    if (userIp) {
      const timestamp = new Date().toISOString();
      setCaptchaToken(token, userIp, timestamp);
    }
  }, [userIp, setCaptchaToken]);

  // Early returns after all hooks are defined
  if (accepted && captchaToken) {
    return null;
  }

  if (!userIp) {
    return <CircularProgress />;
  }

  const maskedIp = maskIP(userIp);

  return (
    <div style={{ textAlign }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={privacyChecked}
            onChange={(e) => handlePrivacyChange(e.target.checked)}
          />
        }
        label={
          <div style={{ wordBreak: 'break-word' }}>
            I accept the <a href="/privacy_policy.html" target="_blank">privacy policy</a> 
            {' '}and the public sharing of my IP: {maskedIp}
          </div>
        }
        sx={{ 
          alignItems: 'flex-start',
          '.MuiFormControlLabel-label': { 
            mt: '2px'
          }
        }}
      />
      {privacyChecked && (
        <div style={{ marginTop: '10px' }}>
          <HCaptcha
            sitekey="1f6c862a-be6e-4304-82b8-6ba6d5d851c2"
            onVerify={handleHCaptchaVerify}
            theme="light"
          />
        </div>
      )}
    </div>
  );
}

export default PrivacyAccept; 