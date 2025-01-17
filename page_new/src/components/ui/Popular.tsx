import { useState, useEffect } from 'react'
import { Card, CardContent, Typography, CircularProgress } from '@mui/material'
import { useNavigate } from 'react-router-dom'

const LIMIT = 15
const SEED_RANGE = 4

interface PollData {
  name: string
  votes: number
}

function Popular() {
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [seed] = useState(() => Math.floor(Math.random() * SEED_RANGE) + 1)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPopularPolls(offset > 0)
  }, [offset])

  const fetchPopularPolls = async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true)
    }
    try {
      const response = await fetch(
        `https://iqpemyqp6lwvg7x6ds3osrs6nm0fcjwy.lambda-url.us-east-1.on.aws/?limit=${LIMIT}&offset=${offset}&seed=${seed}`
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
      <h1>Let the internet vote!</h1>
      {polls.map((poll) => (
        <Card 
          key={poll.name}
          sx={{ mb: 2, cursor: 'pointer' }}
          onClick={() => handlePollClick(poll.name)}
        >
          <CardContent>
            <Typography variant="h6">
              {poll.name.includes('_or_') 
                ? poll.name.replace(/_/g, ' ') + '?'
                : poll.name.replace(/_/g, ' ')}
            </Typography>
            <Typography color="textSecondary">
              {poll.votes} votes
            </Typography>
          </CardContent>
        </Card>
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