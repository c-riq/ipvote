import { FormControlLabel, Checkbox, CircularProgress } from '@mui/material'

interface PrivacyAcceptProps {
  userIp: string | null
  accepted: boolean
  onAcceptChange: (accepted: boolean) => void
  textAlign?: 'left' | 'center' | 'right'
}

function maskIP(ip: string) {
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

function PrivacyAccept({ userIp, accepted, onAcceptChange, textAlign = 'left' }: PrivacyAcceptProps) {
  if (!userIp) {
    return <CircularProgress />
  }

  const maskedIp = maskIP(userIp);

  return (
    <div style={{ textAlign }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={accepted}
            onChange={(e) => onAcceptChange(e.target.checked)}
          />
        }
        label={
          <div style={{ wordBreak: 'break-word' }}>
            I accept the <a href="/privacy_policy.html" target="_blank">privacy policy</a> 
            {' '}and the public sharing of my redacted IP: {maskedIp}
          </div>
        }
        sx={{ 
          alignItems: 'flex-start',
          '.MuiFormControlLabel-label': { 
            mt: '2px'
          }
        }}
      />
    </div>
  )
}

export default PrivacyAccept 