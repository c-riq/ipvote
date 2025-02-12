import { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField,
  Button, 
  CircularProgress,
  Alert
} from '@mui/material';
import { ADD_METADATA_HOST } from '../constants';
import { PhoneVerificationState } from '../App';

interface Comment {
  comment: string;
  userId: string;
  timestamp: number;
}

interface PollCommentsProps {
  poll: string;
  phoneVerification: PhoneVerificationState | null;
  isOpen: boolean;
  comments: Comment[];
  onCommentAdded: () => void;
}

function PollComments({ poll, phoneVerification, isOpen, comments, onCommentAdded }: PollCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{text: string, severity: 'success' | 'error'} | null>(null);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    setAlertMessage(null);
    
    try {
      const pollId = isOpen ? `open_${poll}` : poll;
      const response = await fetch(ADD_METADATA_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          poll: pollId,
          comment: newComment,
          phoneNumber: phoneVerification?.phoneNumber || '',
          phoneToken: phoneVerification?.token || ''
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setAlertMessage({
          text: data.message || 'Comment submitted successfully!',
          severity: 'success'
        });
        setNewComment('');
        onCommentAdded();
      } else {
        setAlertMessage({
          text: data.message || 'Failed to submit comment. Please try again.',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
      setAlertMessage({
        text: 'Network error. Please check your connection and try again.',
        severity: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!phoneVerification?.phoneNumber) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Comments</Typography>
      
      {alertMessage && (
        <Alert 
          severity={alertMessage.severity}
          sx={{ mb: 2 }}
          onClose={() => setAlertMessage(null)}
        >
          {alertMessage.text}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add your comment..."
          disabled={submitting}
          sx={{ mb: 1 }}
        />
        <Button
          variant="contained"
          onClick={handleSubmitComment}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? <CircularProgress size={24} /> : 'Submit Comment'}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {comments
          .sort((a, b) => b.timestamp - a.timestamp)
          .map((comment, index) => (
            <Paper key={index} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {comment.comment}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(comment.timestamp).toLocaleString()}
              </Typography>
            </Paper>
          ))}
      </Box>
    </Paper>
  );
}

export default PollComments; 