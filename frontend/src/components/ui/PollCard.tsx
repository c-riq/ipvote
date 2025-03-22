import { useState, useEffect } from 'react'
import { Card, CardContent, Typography, Box, Button, Tooltip, Alert, CircularProgress } from '@mui/material'
import { IpInfoResponse, PhoneVerificationState } from '../../App'
import AttachmentIcon from '@mui/icons-material/Attachment';
import { submitVote } from '../../api/vote';

interface PollCardProps {
  poll: string
  votes: number
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  handleVote: (poll: string) => void
  privacyAccepted: boolean
  isUpdating?: boolean
  captchaToken: string | undefined
  userIpInfo: IpInfoResponse | null
  requireCaptcha?: boolean
  setShowCaptcha: (show: boolean) => void
  phoneVerification: PhoneVerificationState | null
}

function PollCard({ poll, votes, onClick, handleVote, privacyAccepted, isUpdating, captchaToken, 
  userIpInfo, requireCaptcha = false, setShowCaptcha, phoneVerification }: PollCardProps) {
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [measuringLatency, setMeasuringLatency] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  const hasAttachment = poll.match(/(.+)_attachment_([A-Za-z0-9_-]{43})$/);
  const displayPoll = hasAttachment ? hasAttachment[1] : poll;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0.5 }
    )

    const element = document.getElementById(`poll-${poll}`)
    if (element) {
      observer.observe(element)
    }

    return () => observer.disconnect()
  }, [poll])

  const allowVote = requireCaptcha ? privacyAccepted && !!captchaToken : privacyAccepted

  const vote = async (option: string) => {
    setLoading(true)
    try {
      const response = await submitVote({
        poll,
        vote: option,
        captchaToken: captchaToken || '',
        userIp: userIpInfo?.ip,
        phoneVerification
      });

      setMessage(response.message);
      
      if (response.success) {
        handleVote(poll);
      }
    } catch (error) {
      setMessage('Error submitting vote')
    }
    setLoading(false)
  }

  const renderVoteButtons = () => {
    if (hasAttachment) {
      return null;
    }

    const options = poll.includes('_or_')
      ? poll.split('_or_')
      : poll.startsWith('open_') ? []
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
                (!allowVote && !captchaToken) ? "Please complete the captcha verification" : ""
            }
            arrow
            disableHoverListener={allowVote}
            disableFocusListener={allowVote}
            disableTouchListener={allowVote}
            placement="top"
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <div style={{ display: 'inline-block' }}>
              <Button
                variant="contained"
                disabled={!allowVote || loading}
                onClick={(e) => {
                  e.stopPropagation()
                  vote(option)
                }}
                sx={{
                  minWidth: '100px',
                  textTransform: 'none',
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

        {requireCaptcha && !captchaToken && (
          <Button onClick={(e) => {
            setShowCaptcha(true)
            e.stopPropagation()
          }}>
            I am human
          </Button>
        )}
      </Box>
    )
  }

  return (
    <Card
      id={`poll-${poll}`}
      sx={{
        mb: 2,
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.3s ease-in-out',
        '&:hover': {
          transform: 'scale(1.01)',
        },
        width: {
          xs: '100%',
          sm: '500px'
        },
        ...((!isVisible) && {
          animation: 'pulse 1s ease-in-out',
          '@keyframes pulse': {
            '0%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.01)' },
            '100%': { transform: 'scale(1)' },
          }
        })
      }}
      onClick={onClick}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-start' }}>
          <Typography variant="h6" sx={{ textAlign: 'left' }}>
            {displayPoll.includes('_or_')
              ? displayPoll.replace('_or_', ' or ') + '?' :
              displayPoll.startsWith('open_') ? displayPoll.replace(/^open_/g, '') :
              displayPoll}
          </Typography>
          {hasAttachment && (
            <Tooltip title="This poll has an attachment. Click to view details.">
              <AttachmentIcon color="action" />
            </Tooltip>
          )}
        </Box>
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
        <Typography 
          sx={{ 
            position: 'absolute',
            right: 16,
            bottom: 4,
            fontSize: '0.8rem',
            color: 'text.secondary',
            opacity: 0.7,
            mt: 3
          }}
        >
          Click to view details{hasAttachment ? ' and attachment' : ''}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default PollCard 