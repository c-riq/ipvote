import { useState, useEffect } from 'react'
import { Card, CardContent, Typography, CircularProgress } from '@mui/material'
import { useNavigate } from 'react-router-dom'

interface PollData {
  name: string
  votes: number
}

function Popular() {
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPopularPolls()
  }, [])

  const fetchPopularPolls = async () => {
    try {
      const response = await fetch('https://iqpemyqp6lwvg7x6ds3osrs6nm0fcjwy.lambda-url.us-east-1.on.aws/')
      const res = await response.json()
      const formattedPolls = res.data.map(([name, votes]: [string, number]) => ({
        name,
        votes
      }))
      setPolls(formattedPolls)
    } catch (error) {
      console.error('Error fetching popular polls:', error)
    }
    setLoading(false)
  }

  const handlePollClick = (pollName: string) => {
    navigate(`/${pollName}`)
  }

  if (loading) {
    return <CircularProgress />
  }

  return (
    <div>
      <h1>Popular Polls</h1>
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
    </div>
  )
}

export default Popular 