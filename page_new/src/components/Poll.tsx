import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Checkbox, FormControlLabel, Alert, CircularProgress } from '@mui/material'

function Poll() {
  const location = useLocation()
  const [poll, setPoll] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [results, setResults] = useState<{ [key: string]: number }>({})
  const [userIp, setUserIp] = useState<string>('')

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
        const votes = text.split('\n')
        
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
      setMessage(JSON.parse(data)?.message || data)
      fetchResults(poll)
    } catch (error) {
      setMessage('Error submitting vote')
    }
    setLoading(false)
  }

  const renderVoteButtons = () => {
    if (poll.includes('_or_')) {
      const options = poll.split('_or_').sort()
      return options.map(option => (
        <Button
          key={option}
          variant="contained"
          disabled={!privacyAccepted || loading}
          onClick={() => vote(option)}
          sx={{ m: 1 }}
        >
          {option}
        </Button>
      ))
    }
    
    return (
      <>
        <Button
          variant="contained"
          disabled={!privacyAccepted || loading}
          onClick={() => vote('yes')}
          sx={{ m: 1 }}
        >
          Yes
        </Button>
        <Button
          variant="contained"
          disabled={!privacyAccepted || loading}
          onClick={() => vote('no')}
          sx={{ m: 1 }}
        >
          No
        </Button>
      </>
    )
  }

  return (
    <div className="content">
      <h1 style={{ wordBreak: 'break-word' }}>
        {poll.includes('_or_') ? poll.replace(/_/g, ' ') + '?' : poll.replace(/_/g, ' ')}
      </h1>
      
      {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
      
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
            mt: '2px' // Align text with checkbox
          }
        }}
      />

      <div style={{ margin: '20px 0' }}>
        {loading ? <CircularProgress /> : renderVoteButtons()}
      </div>

      {Object.keys(results).length > 0 && (
        <div>
          <h2>Results</h2>
          {Object.entries(results).map(([option, count]) => (
            <div key={option}>
              {option}: {count} votes 
              ({((count / Object.values(results).reduce((a, b) => a + b, 0)) * 100).toFixed(2)}%)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Poll 