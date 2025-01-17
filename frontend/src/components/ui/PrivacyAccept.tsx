import { FormControlLabel, Checkbox, CircularProgress } from '@mui/material'

interface PrivacyAcceptProps {
  userIp: string | null
  accepted: boolean
  onAcceptChange: (accepted: boolean) => void
  textAlign?: 'left' | 'center' | 'right'
}

function PrivacyAccept({ userIp, accepted, onAcceptChange, textAlign = 'left' }: PrivacyAcceptProps) {
  if (!userIp) {
    return <CircularProgress />
  }

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
            {' '}and the public sharing of my IP: {userIp}
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