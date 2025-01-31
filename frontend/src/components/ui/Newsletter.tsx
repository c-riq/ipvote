import { useState } from 'react'
import { TextField, Button, Alert, CircularProgress } from '@mui/material'
import { NEWSLETTER_HOST } from '../../constants'

function Newsletter() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    if (!email) {
      setMessage('Please enter your email address')
      setIsError(true)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `${NEWSLETTER_HOST}/?email=${encodeURIComponent(email)}`
      )
      const data = await response.json()
      setMessage(data.message)
      if (response.status === 200) {
        setEmail('')
        setIsError(false)
      }
    } catch (error) {
      setMessage('An error occurred. Please try again later.')
      setIsError(true)
    }
    setLoading(false)
  }

  return (
    <div>
      <h1>Newsletter</h1>
      <p>Subscribe to receive updates about new features and popular polls.</p>
      
      {message && (
        <Alert 
          severity={isError ? 'error' : 'success'}
          sx={{ mb: 2 }}
        >
          {message}
        </Alert>
      )}

      <div style={{ display: 'flex', gap: '1rem', maxWidth: '500px' }}>
        <TextField
          fullWidth
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          disabled={loading}
        />
        <Button
          variant="contained"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Subscribe'}
        </Button>
      </div>
    </div>
  )
}

export default Newsletter 