import { useState, useEffect, useRef } from 'react'
import { CircularProgress } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  tags?: string[]
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

const VALID_TAGS = ['all', 'global', 'approval rating', 'national', 'other'] as const

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
  const [searchParams, setSearchParams] = useSearchParams()
  const tag = searchParams.get('tag') || 'all'

  const handleTagChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTag = event.target.value
    if (newTag === 'all') {
      searchParams.delete('tag')
    } else {
      searchParams.set('tag', newTag)
    }
    setSearchParams(searchParams)
  }

  useEffect(() => {
    setOffset(0)
    setPolls([])
    fetchPopularPolls(false)
  }, [query, tag])

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
          seed}&q=${encodeURIComponent(query)}&pollToUpdate=${pollToUpdate}${
          tag !== 'all' ? `&tag=${encodeURIComponent(tag)}` : ''}`
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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end',
        marginBottom: '20px'
      }}>
        <select 
          value={tag}
          onChange={handleTagChange}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        >
          {VALID_TAGS.map((tagOption) => (
            <option key={tagOption} value={tagOption}>
              {tagOption.charAt(0).toUpperCase() + tagOption.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        setCaptchaToken={setCaptchaToken}
        captchaToken={captchaToken}
        showCaptcha={showCaptcha}
      />
      <div style={{ marginTop: '20px' }} />
      {polls.length > 0 ? (
        polls.map((poll) => (
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
        ))
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#666',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <p>No polls found {query ? 'matching your search' : 'in this category'}</p>
          {tag !== 'all' && (
            <p>Try selecting a different category or view all polls</p>
          )}
        </div>
      )}
      
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