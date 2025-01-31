import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  TextField, 
  Button, 
  RadioGroup, 
  FormControlLabel, 
  Radio, 
  Alert,
  Paper
} from '@mui/material'

function CreatePoll() {
  const [pollType, setPollType] = useState('yesNo')
  const [optionA, setOptionA] = useState('')
  const [optionB, setOptionB] = useState('')
  const [yesNoQuestion, setYesNoQuestion] = useState('')
  const [openQuestion, setOpenQuestion] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const sanitizePollText = (text: string) => {
    return text
      // Replace all types of whitespace with regular space
      .replace(/[\s\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
      // Remove special chars
      .replace(/[<>{}[\]\\\/\|;:'"`,~!@#$%^&*()]/g, '')
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace
      .trim()
  }

  const handleCreate = () => {
    if (pollType === 'or') {
      const cleanOptionA = sanitizePollText(optionA)
      const cleanOptionB = sanitizePollText(optionB)

      if (!cleanOptionA || !cleanOptionB) {
        setError('Please enter both options')
        return
      }
      if (cleanOptionA.length > 200 || cleanOptionB.length > 200) {
        setError('Options must be 200 characters or less')
        return
      }
      if (cleanOptionA === cleanOptionB) {
        setError('Options must be different')
        return
      }

      const pollPath = encodeURIComponent(cleanOptionA) + '_or_' + encodeURIComponent(cleanOptionB)
      navigate(`/${pollPath}`)
    } else if (pollType === 'open') {
      const cleanQuestion = sanitizePollText(openQuestion)

      if (!cleanQuestion) {
        setError('Please enter your question')
        return
      }
      if (cleanQuestion.length > 200) {
        setError('Question must be 200 characters or less')
        return
      }

      navigate(`/open/${encodeURIComponent(cleanQuestion)}`)
    } else {
      const cleanQuestion = sanitizePollText(yesNoQuestion)

      if (!cleanQuestion) {
        setError('Please enter your question')
        return
      }
      if (cleanQuestion.length > 200) {
        setError('Question must be 200 characters or less')
        return
      }

      navigate(`/${encodeURIComponent(cleanQuestion)}`)
    }
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <h1>Create New Poll</h1>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <RadioGroup
        value={pollType}
        onChange={(e) => setPollType(e.target.value)}
        sx={{ mb: 3 }}
      >
        <FormControlLabel 
          value="yesNo" 
          control={<Radio />} 
          label="Yes/No poll" 
        />
        <FormControlLabel 
          value="or" 
          control={<Radio />} 
          label="A or B poll" 
        />
        <FormControlLabel 
          value="open" 
          control={<Radio />} 
          label="Open poll (users can add their own options)" 
        />
      </RadioGroup>

      {pollType === 'or' ? (
        <>
          <TextField
            fullWidth
            value={optionA}
            onChange={(e) => setOptionA(e.target.value)}
            placeholder="First option (letters, numbers, and basic punctuation allowed)"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            value={optionB}
            onChange={(e) => setOptionB(e.target.value)}
            placeholder="Second option (letters, numbers, and basic punctuation allowed)"
            sx={{ mb: 2 }}
          />
        </>
      ) : pollType === 'open' ? (
        <TextField
          fullWidth
          value={openQuestion}
          onChange={(e) => setOpenQuestion(e.target.value)}
          placeholder="Question (letters, numbers, and basic punctuation allowed)"
          sx={{ mb: 2 }}
        />
      ) : (
        <TextField
          fullWidth
          value={yesNoQuestion}
          onChange={(e) => setYesNoQuestion(e.target.value)}
          placeholder="Question for Yes/No vote (letters, numbers, and basic punctuation allowed)"
          sx={{ mb: 2 }}
        />
      )}

      <Button 
        variant="contained" 
        onClick={handleCreate}
        fullWidth
      >
        Create Poll
      </Button>
    </Paper>
  )
}

export default CreatePoll 