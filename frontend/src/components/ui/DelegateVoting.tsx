import { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Button,
  Alert,
  TextField,
  Box
} from '@mui/material';
import PrivacyAccept from './PrivacyAccept';
import { IpInfoResponse, PhoneVerificationState } from '../../App';
import { VALID_TAGS } from '../../constants';

interface DelegateVotingProps {
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean) => void;
  userIpInfo: IpInfoResponse | null;
  phoneVerification: PhoneVerificationState | null;
}

interface Delegation {
  tag: string;
  delegateId: string;
}

function DelegateVoting({ 
  privacyAccepted, 
  onPrivacyAcceptChange, 
  userIpInfo,
  phoneVerification 
}: DelegateVotingProps) {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [newDelegateId, setNewDelegateId] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadDelegations();
  }, []);

  const loadDelegations = async () => {
    try {
      const response = await fetch('/api/delegations');
      if (response.ok) {
        const data = await response.json();
        setDelegations(data);
      }
    } catch (error) {
      console.error('Error loading delegations:', error);
      setError('Failed to load delegations');
    }
  };

  const handleAddDelegation = async () => {
    if (!phoneVerification?.verified) {
      setError('Phone verification required to delegate votes');
      return;
    }

    if (!newDelegateId || !selectedTag) {
      setError('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/delegations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          delegateId: newDelegateId,
          tag: selectedTag,
        }),
      });

      if (response.ok) {
        setSuccess('Delegation added successfully');
        setNewDelegateId('');
        setSelectedTag('');
        loadDelegations();
      } else {
        setError('Failed to add delegation');
      }
    } catch (error) {
      console.error('Error adding delegation:', error);
      setError('Failed to add delegation');
    }
  };

  const handleRemoveDelegation = async (tag: string) => {
    try {
      const response = await fetch(`/api/delegations/${tag}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Delegation removed successfully');
        loadDelegations();
      } else {
        setError('Failed to remove delegation');
      }
    } catch (error) {
      console.error('Error removing delegation:', error);
      setError('Failed to remove delegation');
    }
  };

  return (
    <div>
      <Typography variant="h4" gutterBottom>
        Delegate Voting
      </Typography>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
      />

      {!phoneVerification?.verified && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Phone verification is required to delegate votes. Please verify your phone number in the Identity section.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Current Delegations
        </Typography>
        
        {delegations.length === 0 ? (
          <Typography color="textSecondary">
            No active delegations
          </Typography>
        ) : (
          delegations.map((delegation) => (
            <Box key={delegation.tag} sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              mb: 2 
            }}>
              <Typography>
                {delegation.tag}: delegated to {delegation.delegateId}
              </Typography>
              <Button 
                variant="outlined" 
                color="error" 
                size="small"
                onClick={() => handleRemoveDelegation(delegation.tag)}
              >
                Remove
              </Button>
            </Box>
          ))
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add New Delegation
        </Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Tag</InputLabel>
          <Select
            value={selectedTag}
            label="Tag"
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            {VALID_TAGS.map((tag) => (
              <MenuItem key={tag} value={tag}>
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Delegate ID"
          value={newDelegateId}
          onChange={(e) => setNewDelegateId(e.target.value)}
          sx={{ mb: 2 }}
          helperText="Enter the user ID of the person you want to delegate to"
        />

        <Button 
          variant="contained" 
          onClick={handleAddDelegation}
          disabled={!phoneVerification?.verified}
        >
          Add Delegation
        </Button>
      </Paper>
    </div>
  );
}

export default DelegateVoting; 