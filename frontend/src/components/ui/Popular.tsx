import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import PollCard from './PollCard'
import PrivacyAccept from './PrivacyAccept'

const LIMIT = 15
const SEED_RANGE = 4

interface PollData {
  name: string
  votes: number
}

interface PopularProps {
  privacyAccepted: boolean
  userIp: string | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
}

function Popular({ privacyAccepted, userIp, onPrivacyAcceptChange, query }: PopularProps) {
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [seed] = useState(() => Math.floor(Math.random() * SEED_RANGE) + 1)
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

  const fetchPopularPolls = async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const response = await fetch(
        `https://iqpemyqp6lwvg7x6ds3osrs6nm0fcjwy.lambda-url.us-east-1.on.aws/?limit=${LIMIT}&offset=${offset}&seed=${seed}&q=${encodeURIComponent(query)}`
      )
      const res = await response.json()
      const formattedPolls = res.data.map(([name, votes]: [string, number]) => ({
        name,
        votes
      }))
      
      if (loadMore) {
        setPolls(prev => [...prev, ...formattedPolls])
      } else {
        setPolls(formattedPolls)
      }
      setHasMore(formattedPolls.length === LIMIT)
    } catch (error) {
      console.error('Error fetching popular polls:', error)
    }
    setLoading(false)
    setLoadingMore(false)
  }

  const loadMore = () => {
    setOffset(prev => prev + LIMIT)
  }

  const handlePollClick = (pollName: string) => {
    navigate(`/${pollName}`)
  }

  if (loading) {
    return <CircularProgress />
  }

  return (
    <div>
      <h2>Let the internet vote!</h2>
      <PrivacyAccept
        userIp={userIp}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
      />
      <div style={{ marginTop: '20px' }} />
      {polls.map((poll) => (
        <PollCard
          key={poll.name}
          name={poll.name}
          votes={poll.votes}
          onClick={() => handlePollClick(poll.name)}
          privacyAccepted={privacyAccepted}
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