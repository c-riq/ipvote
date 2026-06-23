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
  const [measuringLatency, _] = useState(false)
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
        gap: 1.5,
        justifyContent: 'center',
        mt: 3,
        flexWrap: 'wrap'
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
            <div style={{ display: 'inline-block', flex: '1 1 auto', minWidth: '120px' }}>
              <Button
                variant="contained"
                disabled={!allowVote || loading}
                onClick={(e) => {
                  e.stopPropagation()
                  vote(option)
                }}
                sx={{
                  width: '100%',
                  minWidth: '120px',
                  textTransform: 'capitalize',
                  fontSize: '1rem',
                  fontWeight: 600,
                  padding: '12px 24px',
                  borderRadius: '10px',
                  backgroundColor: '#2D7DC5',
                  border: 'none',
                  color: '#FFFFFF',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: '#1E6AAD',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 16px rgba(45, 125, 197, 0.35)',
                  },
                  '&.Mui-disabled': {
                    pointerEvents: 'auto',
                    backgroundColor: '#E8F2FB',
                    color: '#7A9DBB',
                    border: '1px solid #C8DDEF',
                  }
                }}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : option}
              </Button>
            </div>
          </Tooltip>
        ))}

        {requireCaptcha && !captchaToken && (
          <Button
            onClick={(e) => {
              setShowCaptcha(true)
              e.stopPropagation()
            }}
            sx={{
              minWidth: '120px',
              padding: '12px 24px',
              borderRadius: '10px',
              backgroundColor: '#2D7DC5',
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: '#1E6AAD',
              }
            }}
          >
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
        mb: 3,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.3s ease',
        background: '#FFFFFF',
        border: '1px solid #C8DDEF',
        borderRadius: '16px',
        overflow: 'visible',
        boxShadow: '0 1px 3px rgba(45, 125, 197, 0.06)',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 12px 24px rgba(45, 125, 197, 0.18)',
          borderColor: '#589dd8',
        },
        width: {
          xs: '100%',
          sm: '600px'
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
      <CardContent sx={{ padding: '24px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-start', mb: 2 }}>
          <Typography
            variant="h6"
            sx={{
              textAlign: 'left',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#1A2B3C',
              lineHeight: 1.4
            }}
          >
            {displayPoll.includes('_or_')
              ? displayPoll.replace('_or_', ' or ') + '?' :
              displayPoll.startsWith('open_') ? displayPoll.replace(/^open_/g, '') :
              displayPoll}
          </Typography>
          {hasAttachment && (
            <Tooltip title="This poll has an attachment. Click to view details.">
              <AttachmentIcon sx={{ color: '#2D7DC5' }} />
            </Tooltip>
          )}
        </Box>
        <Typography
          sx={{
            color: '#4A6480',
            fontSize: '0.9rem',
            mb: 2,
            fontWeight: 500
          }}
        >
          {votes.toLocaleString()} votes {isUpdating && <CircularProgress size={12} sx={{ ml: 1 }} />}
        </Typography>
        {(message || measuringLatency) && (
          <Alert
            severity={message === 'Vote submitted successfully!' ? 'success' : 'warning'}
            sx={{
              mb: 2,
              borderRadius: '8px',
            }}
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
            fontSize: '0.75rem',
            color: '#7A9DBB',
            opacity: 0.8,
            mt: 3,
            textAlign: 'center',
            fontWeight: 500
          }}
        >
          Click to view details{hasAttachment ? ' and attachment' : ''}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default PollCard 