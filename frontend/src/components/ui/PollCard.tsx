import { useState } from 'react'
import { Card, CardContent, Typography, Box, Button, Tooltip, Alert, CircularProgress } from '@mui/material'
import { triggerLatencyMeasurementIfNeeded } from '../../utils/latencyTriangulation'
import { IpInfoResponse } from '../../App'

interface PollCardProps {
  name: string
  votes: number
  onClick: () => void
  handleVote: (pollName: string) => void
  privacyAccepted: boolean
  isUpdating?: boolean
  captchaToken: string | undefined
  userIpInfo: IpInfoResponse | null
}

function PollCard({ name, votes, onClick, handleVote, privacyAccepted, isUpdating, captchaToken, userIpInfo }: PollCardProps) {
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [measuringLatency, setMeasuringLatency] = useState(false)

  const vote = async (option: string) => {
    setLoading(true)
    try {
      const response = await fetch(`https://a47riucyg3q3jjnn5gic56gtcq0upfxg.lambda-url.us-east-1.on.aws/?poll=${name}&vote=${option}&captchaToken=${captchaToken}`)
      const data = await response.text()
      if (response.status === 200) {
        setMessage('Vote submitted successfully!')
        handleVote(name)
        if (userIpInfo?.ip) {
          setMeasuringLatency(true)
          await triggerLatencyMeasurementIfNeeded(userIpInfo.ip)
          setMeasuringLatency(false)
        }
      } else {
        setMessage(JSON.parse(data)?.message || data)
      }
    } catch (error) {
      setMessage('Error submitting vote')
    }
    setLoading(false)
  }

  const renderVoteButtons = () => {
    const options = name.includes('_or_') 
      ? name.split('_or_')
      : ['yes', 'no']

    return (
      <Box sx={{ 
        display: 'flex',
        gap: 2,
        justifyContent: 'center',
        mt: 2
      }}>
        {options.map(option => (
          <Tooltip 
            key={option}
            title={
              !privacyAccepted ? "Please accept the privacy policy first" :
              !captchaToken ? "Please complete the captcha verification" : ""
            }
            arrow
            disableHoverListener={privacyAccepted && !!captchaToken}
            disableFocusListener={privacyAccepted && !!captchaToken}
            disableTouchListener={privacyAccepted && !!captchaToken}
            placement="top"
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <div style={{ display: 'inline-block' }}>
              <Button
                variant="contained"
                disabled={!privacyAccepted || loading || !captchaToken}
                onClick={(e) => {
                  e.stopPropagation()
                  vote(option)
                }}
                sx={{ 
                  minWidth: '100px',
                  '&.Mui-disabled': {
                    pointerEvents: 'auto'
                  }
                }}
              >
                {option}
              </Button>
            </div>
          </Tooltip>
        ))}
      </Box>
    )
  }

  return (
    <Card 
      sx={{ mb: 2, cursor: 'pointer' }}
      onClick={onClick}
    >
      <CardContent>
        <Typography variant="h6">
          {name.includes('_or_') 
            ? name.replace(/_/g, ' ') + '?'
            : name.replace(/_/g, ' ')}
        </Typography>
        <Typography color="textSecondary">
          {votes} votes {isUpdating && <CircularProgress size={10} sx={{ ml: 1 }} />}
        </Typography>
        {(message || measuringLatency) && (
          <Alert 
            severity={message === 'Vote submitted successfully!' ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            {message}
            {measuringLatency && (
              <div style={{ marginTop: message ? '8px' : 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CircularProgress size={16} />
                <span>Measuring network latency for geolocation. This may take a few seconds...</span>
              </div>
            )}
          </Alert>
        )}
        {renderVoteButtons()}
      </CardContent>
    </Card>
  )
}

export default PollCard 