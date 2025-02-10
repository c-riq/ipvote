import { useState, useEffect, useRef } from 'react'
import { CircularProgress } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import PollCard from './PollCard'
import PrivacyAccept from './PrivacyAccept'
import { IpInfoResponse, PhoneVerificationState } from '../../App'
import { CAPTCHA_THRESHOLD, POPULAR_POLLS_HOST } from '../../constants'

const LIMIT = 15

export interface PollData {
  name: string
  votes: number
  isUpdating?: boolean
  isOpen?: boolean
}

interface PopularProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
  phoneVerification: PhoneVerificationState | null
}

function Popular({ privacyAccepted, userIpInfo, onPrivacyAcceptChange, 
    query, captchaToken, setCaptchaToken, phoneVerification }: PopularProps) {
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [seed] = useState(1)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const lastQueryTimestampRef = useRef<number>(0)
  const navigate = useNavigate()

  useEffect(() => {
    setOffset(0)
    setPolls([])
    fetchPopularPolls(false)
  }, [query])

  useEffect(() => {
    if (offset > 0) {
      fetchPopularPolls(true)
    }
  }, [offset])

  const fetchPopularPolls = async (loadMore = false, pollToUpdate: string = '') => {

    if (loadMore) {
      setLoadingMore(true)
    } else {
      if (!pollToUpdate) {
        setLoading(true)
      } else {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...poll, isUpdating: true }
            : poll
        ))
      }
    }

    try {
      const queryTimestamp = Date.now()
      lastQueryTimestampRef.current = queryTimestamp
      console.log('fetchPopularPolls', queryTimestamp, query)
      const response = await fetch(
        `${POPULAR_POLLS_HOST}/?limit=${LIMIT}&offset=${offset}&seed=${
          seed}&q=${encodeURIComponent(query)}&pollToUpdate=${pollToUpdate}`
      )
      const res = await response.json()

      if (queryTimestamp < lastQueryTimestampRef.current) {
        console.log('Ignoring stale response from earlier query')
        return
      }

      const formattedPolls = res.data.map(([name, votes]: [string, number]) => ({
        name,
        votes,
        isOpen: name.startsWith('open_')
      }))

      if (loadMore) {
        setPolls(prev => [...prev, ...formattedPolls])
      } else if (pollToUpdate) {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...formattedPolls[0], isUpdating: false }
            : poll
        ))
      } else {
        setPolls(formattedPolls)
      }
      setHasMore(formattedPolls.length === LIMIT)
    } catch (error) {
      console.error('Error fetching popular polls:', error)
      if (pollToUpdate) {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...poll, isUpdating: false }
            : poll
        ))
      }
    }
    setLoading(false)
    setLoadingMore(false)
  }

  const loadMore = () => {
    setOffset(prev => prev + LIMIT)
  }

  const handlePollClick = (poll: string, event: React.MouseEvent) => {
    const isOpen = poll.startsWith('open_')
    const path = isOpen ? `/open/${encodeURIComponent(poll.replace(/^open_/g, ''))}` : `/${encodeURIComponent(poll)}`
    if (event.metaKey || event.ctrlKey) {
      // Open in new tab
      window.open(path, '_blank')
    } else {
      // Regular navigation
      navigate(path)
    }
  }

  const handleVote = (poll: string) => {
    fetchPopularPolls(false, poll)
  }

  if (loading) {
    return <CircularProgress />
  }

  return (
    <div>
      <h2>Let the internet vote!</h2>
      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        setCaptchaToken={setCaptchaToken}
        captchaToken={captchaToken}
        showCaptcha={showCaptcha}
      />
      <div style={{ marginTop: '20px' }} />
      {polls.map((poll) => (
        <PollCard
          key={`${poll.name}-${poll.votes}`}
          poll={poll.name}
          votes={poll.votes}
          onClick={(e) => handlePollClick(poll.name, e)}
          handleVote={handleVote}
          privacyAccepted={privacyAccepted}
          isUpdating={poll.isUpdating}
          captchaToken={captchaToken}
          userIpInfo={userIpInfo}
          requireCaptcha={poll.votes > CAPTCHA_THRESHOLD}
          setShowCaptcha={setShowCaptcha}
          phoneVerification={phoneVerification}
        />
      ))}
      
      {hasMore && !loading && (
        <button 
          onClick={loadMore}
          disabled={loadingMore}
          style={{ 
            width: '100%', 
            padding: '10px', 
            marginTop: '10px',
            cursor: loadingMore ? 'default' : 'pointer'
          }}
        >
          {loadingMore ? <CircularProgress size={20} /> : 'Load More'}
        </button>
      )}
    </div>
  )
}

export default Popular 