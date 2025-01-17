import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { 
  Button, 
  Checkbox, 
  FormControlLabel, 
  Alert, 
  CircularProgress,
  Box,
  LinearProgress,
  Typography
} from '@mui/material'
import Plot from 'react-plotly.js'

interface VoteHistory {
  date: string;
  votes: { [key: string]: number };
}

function Poll() {
  const location = useLocation()
  const [poll, setPoll] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [results, setResults] = useState<{ [key: string]: number }>({})
  const [userIp, setUserIp] = useState<string>('')
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])

  useEffect(() => {
    // Get poll ID from URL path or hash
    const pollFromPath = decodeURIComponent(location.pathname.split('/')[1])
    const pollFromHash = location.hash ? decodeURIComponent(location.hash.substring(1)) : ''
    const currentPoll = pollFromHash || pollFromPath

    if (currentPoll) {
      setPoll(currentPoll)
      fetchResults(currentPoll)
    }

    // Fetch user's IP
    fetch('https://rudno6667jmowgyjqruw7dkd2i0bhcpo.lambda-url.us-east-1.on.aws/')
      .then(response => response.json())
      .then(data => setUserIp(data.ip))
  }, [location])

  const fetchResults = async (pollId: string) => {
    try {
      const response = await fetch(`https://krzzi6af5wivgfdvtdhllb4ycm0zgjde.lambda-url.us-east-1.on.aws/?poll=${pollId}`)
      if (response.status === 200) {
        const text = await response.text()
        const votes = text.split('\n').filter(line => line.trim())
        
        // Process current totals
        if (pollId.includes('_or_')) {
          const options = pollId.split('_or_')
          const option1Votes = votes.filter(vote => vote.split(',')[3] === options[0]).length
          const option2Votes = votes.filter(vote => vote.split(',')[3] === options[1]).length
          setResults({ [options[0]]: option1Votes, [options[1]]: option2Votes })
        } else {
          const yesVotes = votes.filter(vote => vote.split(',')[3] === 'yes').length
          const noVotes = votes.filter(vote => vote.split(',')[3] === 'no').length
          setResults({ yes: yesVotes, no: noVotes })
        }

        // Process historical data
        const dailyVotes: { [key: string]: { [key: string]: number } } = {}
        
        votes.forEach(vote => {
          try {
            const [timestamp, , , option] = vote.split(',')
            // Convert milliseconds to seconds if needed
            const ts = timestamp.length === 13 ? parseInt(timestamp) : parseInt(timestamp) * 1000
            const date = new Date(ts).toISOString().split('T')[0]
            
            if (!dailyVotes[date]) {
              dailyVotes[date] = {}
            }
            dailyVotes[date][option] = (dailyVotes[date][option] || 0) + 1
          } catch (error) {
            console.warn('Invalid timestamp in vote:', vote)
          }
        })

        // Convert to array and sort by date
        const history = Object.entries(dailyVotes).map(([date, votes]) => ({
          date,
          votes
        })).sort((a, b) => a.date.localeCompare(b.date))

        setVoteHistory(history)
      }
    } catch (error) {
      console.error('Error fetching results:', error)
    }
  }

  const vote = async (option: string) => {
    if (!privacyAccepted) {
      setMessage('Please accept the privacy policy first')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`https://a47riucyg3q3jjnn5gic56gtcq0upfxg.lambda-url.us-east-1.on.aws/?poll=${poll}&vote=${option}`)
      const data = await response.text()
      if (response.status === 200) {
        setMessage('Vote submitted successfully!')
      } else {
        setMessage(JSON.parse(data)?.message || data)
      }
      fetchResults(poll)
    } catch (error) {
      setMessage('Error submitting vote')
    }
    setLoading(false)
  }

  const renderResults = () => {
    if (Object.keys(results).length === 0) return null;
    
    const totalVotes = Object.values(results).reduce((a, b) => a + b, 0);
    
    return Object.entries(results).map(([option, count]) => {
      const percentage = (count / totalVotes) * 100;
      return (
        <Box key={option} sx={{ 
          mb: 2,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2
        }}>
          <Box sx={{ 
            flex: 1,
            order: { xs: 1, sm: 2 }
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography>{count} votes</Typography>
              <Typography>{percentage.toFixed(2)}%</Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={percentage}
              sx={{
                height: 20,
                borderRadius: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'primary.main',
                }
              }}
            />
          </Box>
          {!loading && (
            <Button
              variant="contained"
              disabled={!privacyAccepted}
              onClick={() => vote(option)}
              sx={{ 
                minWidth: '100px',
                order: { xs: 2, sm: 1 },
                width: { xs: '100%', sm: 'auto' }
              }}
            >
              {option}
            </Button>
          )}
        </Box>
      );
    });
  };

  const renderVoteHistory = () => {
    if (voteHistory.length === 0) return null

    const options = poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']
    const traces = options.map(option => ({
      x: voteHistory.map(day => day.date),
      y: voteHistory.map(day => day.votes[option] || 0),
      name: option,
      type: 'scatter',
      mode: 'lines',
    }))

    return (
      <Box sx={{ mt: 4, height: '300px' }}>
        <Plot
          data={traces}
          layout={{
            title: 'Votes over time',
            autosize: true,
            margin: { t: 30, r: 10, b: 30, l: 40 },
            xaxis: {
              title: 'Date',
              showgrid: false,
            },
            yaxis: {
              title: 'Votes',
              showgrid: true,
            },
            showlegend: true,
            legend: {
              x: 0,
              y: 1,
              orientation: 'h'
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </Box>
    )
  }

  return (
    <div className="content">
      <h1 style={{ wordBreak: 'break-word' }}>
        {poll.includes('_or_') ? poll.replace(/_/g, ' ') + '?' : poll.replace(/_/g, ' ')}
      </h1>
      
      {message && (
        <Alert 
          severity={message === 'Vote submitted successfully!' ? 'success' : 'warning'}
          sx={{ mb: 2 }}
        >
          {message}
        </Alert>
      )}
      
      {!userIp ? (
        <CircularProgress />
      ) : (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
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

          <div style={{ margin: '20px 0' }}>
            {loading ? <CircularProgress /> : renderResults()}
          </div>

          {renderVoteHistory()}
        </>
      )}
    </div>
  )
}

export default Poll 