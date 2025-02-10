import { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Chip, 
  Button, 
  CircularProgress,
  FormControl,
  FormLabel,
  Alert
} from '@mui/material';
import { ADD_METADATA_HOST } from '../constants';
import { PhoneVerificationState } from '../App';

interface Metadata {
  comments: {
    comment: string;
    userId: string;
    timestamp: number;
  }[];
  tags: {
    tag: string;
    userId: string;
    timestamp: number;
  }[];
  lastUpdated: number;
}

interface PollMetadataProps {
  poll: string;
  phoneVerification: PhoneVerificationState | null;
  isOpen: boolean;
}

function PollMetadata({ poll, phoneVerification, isOpen }: PollMetadataProps) {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    if (poll) {
      fetchMetadata();
    }
  }, [poll]);

  const fetchMetadata = async () => {
    setMetadataLoading(true);
    try {
      const pollId = isOpen ? `open_${poll}` : poll;
      const response = await fetch(`${ADD_METADATA_HOST}/?poll=${encodeURIComponent(pollId)}`);
      if (response.ok) {
        const data = await response.json();
        setMetadata(data);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleTagSubmit = async (tag: string) => {
    setTagSubmitting(true);
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
          tag,
          phoneNumber: phoneVerification?.phoneNumber || '',
          phoneToken: phoneVerification?.token || ''
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setAlertMessage(data.message || 'Tag submitted successfully!');
        fetchMetadata();
      } else {
        setAlertMessage(data.message || 'Failed to submit tag. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting tag:', error);
      setAlertMessage('Network error. Please check your connection and try again.');
    } finally {
      setTagSubmitting(false);
    }
  };

  const renderTagSubmission = () => {
    if (!phoneVerification?.phoneNumber) return null;

    return (
      <Box sx={{ mt: 4, mb: 2 }}>
        {alertMessage && (
          <Alert 
            severity={alertMessage.includes('success') ? 'success' : 'error'}
            sx={{ mb: 2 }}
            onClose={() => setAlertMessage(null)}
          >
            {alertMessage}
          </Alert>
        )}
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Add Tag</Typography>
          <FormControl fullWidth>
            <FormLabel>Select a tag category for this poll</FormLabel>
            <Box sx={{ mt: 1 }}>
              {['global', 'approval rating', 'national', 'other'].map((tagOption) => (
                <Button
                  key={tagOption}
                  variant="outlined"
                  onClick={() => handleTagSubmit(tagOption)}
                  sx={{ mr: 1, mb: 1, textTransform: 'capitalize' }}
                  disabled={tagSubmitting}
                >
                  {tagSubmitting ? (
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                  ) : null}
                  {tagOption}
                </Button>
              ))}
            </Box>
          </FormControl>
        </Paper>
      </Box>
    );
  };

  // Return null if no phone verification
  if (!phoneVerification?.phoneNumber) return null;

  if (metadataLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      { !!metadata?.tags?.length && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Tags</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {metadata?.tags?.map((tag, index) => (
              <Chip
                key={index}
                label={tag.tag}
                color="primary"
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
            ))}
          </Box>
        </Paper>
      )}

      { !!metadata?.comments?.length && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Comments</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {metadata?.comments
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((comment, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body1">{comment.comment}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(comment.timestamp).toLocaleString()}
                  </Typography>
                </Paper>
              ))}
          </Box>
        </Paper>
      )}

      {renderTagSubmission()}
    </>
  );
}

export default PollMetadata; 