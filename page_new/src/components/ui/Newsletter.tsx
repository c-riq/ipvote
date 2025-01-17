import { useState } from 'react'
import { TextField, Button, Alert, CircularProgress } from '@mui/material'

function Newsletter() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    if (!email) {
      setMessage('Please enter your email address')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `https://4c6h4byudhvb77kisfehckmaim0dmswz.lambda-url.us-east-1.on.aws/?email=${encodeURIComponent(email)}`
      )
      const data = await response.json()
      setMessage(data.message)
      if (response.status === 200) {
        setEmail('')
      }
    } catch (error) {
      setMessage('An error occurred. Please try again later.')
    }
    setLoading(false)
  }

  return (
    <div>
      <h1>Newsletter</h1>
      <p>Subscribe to receive updates about new features and popular polls.</p>
      
      {message && (
        <Alert 
          severity={message.includes('success') ? 'success' : 'warning'}
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