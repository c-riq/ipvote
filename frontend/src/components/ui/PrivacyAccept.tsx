import { FormControlLabel, Checkbox, CircularProgress } from '@mui/material'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { useState, useCallback } from 'react'
import { IpInfoResponse } from '../../App'

interface PrivacyAcceptProps {
  userIpInfo: IpInfoResponse | null
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

function PrivacyAccept({ userIpInfo, accepted, onAcceptChange, setCaptchaToken, captchaToken, textAlign = 'center' }: PrivacyAcceptProps) {
  const [privacyChecked, setPrivacyChecked] = useState(accepted);
  const [verificationError, setVerificationError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handlePrivacyChange = useCallback((checked: boolean) => {
    setPrivacyChecked(checked);
    onAcceptChange(checked);
  }, [onAcceptChange]);

  const handleHCaptchaVerify = async (token: string) => {
    setVerificationError(false);
    setIsVerifying(true);
    if (userIpInfo?.ip) {
      try {
        const response = await fetch('https://fvy6d5uwjmmhjv3bvbtlrcw5xu0ldcjf.lambda-url.us-east-1.on.aws/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            captchaToken: token,
            ip: userIpInfo?.ip
          })
        });
        if (response.status !== 200) {
          console.error('Captcha verification failed', response);
          setVerificationError(true);
        } else {
          const timestamp = new Date().toISOString();
          setCaptchaToken(token, userIpInfo?.ip, timestamp);
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  // Early returns after all hooks are defined
  if (accepted && captchaToken) {
    return null;
  }

  if (!userIpInfo?.ip) {
    return <CircularProgress />;
  }

  const maskedIp = maskIP(userIpInfo.ip);
  console.log('captchaToken', captchaToken);
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
            {' '}and the public sharing of my redacted IP: {maskedIp} ({userIpInfo?.geo?.country_name}) <br/>
            <p>IP info is powered by <a href="https://ipinfo.io" target="_blank">ipinfo.io</a></p>
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
          {isVerifying ? (
            <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CircularProgress size={20} />
              <span>Verifying captcha...</span>
            </div>
          ) : <HCaptcha
            sitekey="1f6c862a-be6e-4304-82b8-6ba6d5d851c2"
            onVerify={handleHCaptchaVerify}
            theme="light"
          />}
          {verificationError && (
            <div style={{ color: 'red', marginTop: '5px' }}>
              Captcha verification failed. Please try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PrivacyAccept; 