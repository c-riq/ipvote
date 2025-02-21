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
import { POLL_ATTACHMENT_UPLOAD_HOST } from '../../constants'

function CreatePoll() {
  const [pollType, setPollType] = useState('yesNo')
  const [optionA, setOptionA] = useState('')
  const [optionB, setOptionB] = useState('')
  const [yesNoQuestion, setYesNoQuestion] = useState('')
  const [openQuestion, setOpenQuestion] = useState('')
  const [error, setError] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const navigate = useNavigate()

  const sanitizePollText = (text: string) => {
    return text
      // Replace all types of whitespace with regular space
      .replace(/[\s\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
      // URL encode specific punctuation marks
      .replace(/[<>{}\\|;:'"`~!@#$%^&*]/g, '')
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // double encode ,
      //.replace(/,/g, '%2C')
      // Remove leading/trailing whitespace
      .trim()
  }

  // Add new helper function to compute SHA-256 hash
  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    // Convert to base64 and make URL safe
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return base64;
  };

  // Add new helper function to upload PDF
  const uploadPdf = async (file: File, hash: string): Promise<boolean> => {
    try {
      // First get the signed URL
      const response = await fetch(`${POLL_ATTACHMENT_UPLOAD_HOST}/?hash=${hash}`);
      const { uploadUrl } = await response.json();

      // Upload the file using the signed URL
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/pdf',
        },
      });

      return true;
    } catch (error) {
      console.error('Error uploading PDF:', error);
      return false;
    }
  };

  const handleCreate = async () => {
    // Get hash if PDF file exists
    let attachmentSuffix = '';
    if (pdfFile) {
      try {
        const hash = await computeFileHash(pdfFile);
        const uploadSuccess = await uploadPdf(pdfFile, hash);
        
        if (!uploadSuccess) {
          setError('Failed to upload PDF file');
          return;
        }
        attachmentSuffix = `_attachment_${hash}`;
      } catch (error) {
        console.error('Error processing PDF:', error);
        setError('Failed to process PDF file');
        return;
      }
    }

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

      const pollPath = encodeURIComponent(cleanOptionA) + '_or_' + encodeURIComponent(cleanOptionB) + attachmentSuffix;
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

      navigate(`/open/${encodeURIComponent(cleanQuestion)}${attachmentSuffix}`)
    } else {
      const cleanQuestion = sanitizePollText(yesNoQuestion)
      console.log(cleanQuestion)

      if (!cleanQuestion) {
        setError('Please enter your question')
        return
      }
      if (cleanQuestion.length > 200) {
        setError('Question must be 200 characters or less')
        return
      }

      navigate(`/${encodeURIComponent(cleanQuestion)}${attachmentSuffix}`)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Please upload a PDF file')
        return
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('PDF file must be smaller than 5MB')
        return
      }
      setPdfFile(file)
      setError('')
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
        component="label"
        variant="outlined"
        fullWidth
        sx={{ mb: 2 }}
      >
        {pdfFile ? `Selected: ${pdfFile.name}` : 'Attach PDF (optional)'}
        <input
          type="file"
          hidden
          accept=".pdf"
          onChange={handleFileChange}
        />
      </Button>

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