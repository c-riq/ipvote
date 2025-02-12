import { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField,
  Button, 
  CircularProgress,
  Alert,
  IconButton,
  Collapse
} from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import { ADD_METADATA_HOST } from '../constants';
import { PhoneVerificationState } from '../App';
import { alpha } from '@mui/material/styles';

interface Comment {
  comment: string;
  userId: string;
  timestamp: number;
  parentId?: string;
  id: string;
}

interface PollCommentsProps {
  poll: string;
  phoneVerification: PhoneVerificationState | null;
  isOpen: boolean;
  comments: Comment[];
  onCommentAdded: () => void;
}

function PollComments({ poll, phoneVerification, isOpen, comments, onCommentAdded }: PollCommentsProps) {
  const [commentFields, setCommentFields] = useState<Record<string, string>>({ main: '' });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submittingComments, setSubmittingComments] = useState<Record<string, boolean>>({ main: false });
  const [alertMessage, setAlertMessage] = useState<{text: string, severity: 'success' | 'error'} | null>(null);

  const handleSubmitComment = async (parentId?: string) => {
    const fieldId = parentId || 'main';
    const comment = commentFields[fieldId];
    if (!comment?.trim()) return;

    setSubmittingComments(prev => ({ ...prev, [fieldId]: true }));
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
          comment,
          phoneNumber: phoneVerification?.phoneNumber || '',
          phoneToken: phoneVerification?.token || '',
          parentId
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setAlertMessage({
          text: data.message || 'Comment submitted successfully!',
          severity: 'success'
        });
        setCommentFields(prev => ({ ...prev, [fieldId]: '' }));
        if (parentId) {
          setReplyingTo(null);
        }
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
      setSubmittingComments(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const renderCommentInput = (parentId?: string) => {
    const fieldId = parentId || 'main';
    const isSubmitting = submittingComments[fieldId] || false;
    
    return (
      <Box sx={{ mb: parentId ? 0 : 3 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          value={commentFields[fieldId] || ''}
          onChange={(e) => setCommentFields(prev => ({ ...prev, [fieldId]: e.target.value }))}
          placeholder={parentId ? "Write a reply..." : "Share your thoughts..."}
          disabled={isSubmitting}
          sx={{
            mb: 1,
            '& .MuiOutlinedInput-root': {
              backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.8),
              '&:hover': {
                backgroundColor: 'background.paper',
              },
              '&.Mui-focused': {
                backgroundColor: 'background.paper',
              }
            }
          }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => handleSubmitComment(parentId)}
            disabled={isSubmitting || !commentFields[fieldId]?.trim()}
            sx={{
              px: 3,
              '&.Mui-disabled': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
              }
            }}
          >
            {isSubmitting ? <CircularProgress size={24} /> : parentId ? 'Reply' : 'Comment'}
          </Button>
          {parentId && (
            <Button
              variant="outlined"
              onClick={() => {
                setReplyingTo(null);
                setCommentFields(prev => ({ ...prev, [fieldId]: '' }));
              }}
              sx={{ px: 3 }}
            >
              Cancel
            </Button>
          )}
        </Box>
      </Box>
    );
  };

  const renderCommentThread = (comment: Comment, depth: number = 0) => {
    const replies = comments.filter(c => c.parentId === comment.id);
    const isReplying = replyingTo === comment.id;
    const maxDepth = 5;
    
    return (
      <Box key={comment.id}>
        <Paper 
          variant="outlined" 
          sx={{
            p: 2,
            borderColor: (theme) => alpha(theme.palette.divider, 0.5)
          }}
        >
          <Typography 
            variant="body1" 
            sx={{ 
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
              mb: 1.5
            }}
          >
            {comment.comment}
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
          }}>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              <strong>{comment.userId}</strong>
              <span>•</span>
              {new Date(comment.timestamp).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Typography>
            {depth < maxDepth && (
              <IconButton 
                size="small" 
                onClick={() => {
                  if (isReplying) {
                    setReplyingTo(null);
                    setCommentFields(prev => ({ ...prev, [comment.id]: '' }));
                  } else {
                    setReplyingTo(comment.id);
                  }
                }}
                color={isReplying ? "primary" : "default"}
              >
                <ReplyIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Collapse in={isReplying}>
            <Box sx={{ mt: 2 }}>
              {renderCommentInput(comment.id)}
            </Box>
          </Collapse>
        </Paper>
        
        {replies.length > 0 && (
          <Box 
            sx={{ 
              ml: { xs: 2, sm: 4 }, 
              mt: 1,
              pl: 2,
              borderLeft: (theme) => `2px solid ${alpha(theme.palette.divider, 0.3)}`
            }}
          >
            {replies
              .sort((a, b) => b.timestamp - a.timestamp)
              .map(reply => renderCommentThread(reply, depth + 1))}
          </Box>
        )}
      </Box>
    );
  };

  if (!phoneVerification?.phoneNumber) {
    return null;
  }

  const topLevelComments = comments.filter(c => !c.parentId);

  return (
    <Paper 
      sx={{ 
        p: { xs: 2, sm: 3 }, 
        mt: 4,
        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.7),
      }}
    >
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>Discussion</Typography>
      
      {alertMessage && (
        <Alert 
          severity={alertMessage.severity}
          sx={{ 
            mb: 2,
            '& .MuiAlert-message': {
              width: '100%'
            }
          }}
          onClose={() => setAlertMessage(null)}
        >
          {alertMessage.text}
        </Alert>
      )}

      {renderCommentInput()}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {topLevelComments
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(comment => renderCommentThread(comment))}
      </Box>
    </Paper>
  );
}

export default PollComments; 