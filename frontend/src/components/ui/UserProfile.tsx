import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Typography, 
  Paper, 
  Box, 
  CircularProgress, 
  Alert,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import { IpInfoResponse } from '../../App';
import { AUTH_HOST, PUBLIC_PROFILES_HOST } from '../../constants';
import PrivacyAccept from './PrivacyAccept';

interface UserProfileProps {
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean) => void;
  userIpInfo: IpInfoResponse | null;
}

interface UserData {
  settings: {
    isPolitician: boolean;
    firstName?: string;
    lastName?: string;
    country?: string;
    xUsername?: string;
    linkedinUrl?: string;
    websiteUrl?: string;
    lastUpdated?: string;
  };
  email: string;
  joinedDate: string;
  delegatedVotes: number;
  recentVotes: {
    pollName: string;
    vote: string;
    timestamp: string;
  }[];
  delegatedTags: string[];
}

function UserProfile({ privacyAccepted, onPrivacyAcceptChange, userIpInfo }: UserProfileProps) {
  const { userId } = useParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDelegating, setIsDelegating] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, [userId]);

  const fetchUserProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${PUBLIC_PROFILES_HOST}${userId}.json`);

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      setUserData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDelegateVotes = async () => {
    if (!privacyAccepted) {
      setError('Please accept the privacy policy first');
      return;
    }

    setIsDelegating(true);
    setError(null);

    try {
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('Please log in to delegate votes');
      }

      const response = await fetch(`${AUTH_HOST}/delegate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          delegateId: userId,
          sessionToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delegate votes');
      }

      // Refresh user profile to show updated delegation count
      await fetchUserProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delegate votes');
    } finally {
      setIsDelegating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!userData) {
    return (
      <Alert severity="info" sx={{ my: 2 }}>
        User not found or not a politician
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        User Profile
      </Typography>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
      />

      <Box sx={{ my: 4 }}>
        <Typography variant="h5">
          {userData.settings.firstName && userData.settings.lastName 
            ? `${userData.settings.firstName} ${userData.settings.lastName}`
            : userData.email
          }
        </Typography>
        
        {userData.settings.lastUpdated && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Last updated: {new Date(userData.settings.lastUpdated).toLocaleDateString()}
        </Typography>}

        {userData.settings.country && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            📍 {userData.settings.country}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {userData.settings.xUsername && (
            <Button
              variant="outlined"
              size="small"
              href={`https://x.com/${userData.settings.xUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<Typography>𝕏</Typography>}
            >
              @{userData.settings.xUsername}
            </Button>
          )}
          
          {userData.settings.linkedinUrl && (
            <Button
              variant="outlined"
              size="small"
              href={userData.settings.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<Typography>in</Typography>}
            >
              LinkedIn
            </Button>
          )}
          
          {userData.settings.websiteUrl && (
            <Button
              variant="outlined"
              size="small"
              href={userData.settings.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<Typography>🌐</Typography>}
            >
              Website
            </Button>
          )}
        </Box>

        <Box sx={{ mt: 2 }}>
          <Chip 
            label={`${userData.delegatedVotes} delegated votes`} 
            color="primary" 
            variant="outlined" 
            sx={{ mr: 1 }}
          />
          {userData.settings.isPolitician && (
            <Chip label="Politician" color="secondary" sx={{ mr: 1 }} />
          )}
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ my: 3 }}>
        <Typography variant="h6" gutterBottom>
          Delegated Tags
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {userData.delegatedTags?.map((tag) => (
            <Chip key={tag} label={tag} />
          )) || (
            <Typography variant="body2" color="text.secondary">
              No delegated tags
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ my: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Public Votes
        </Typography>
        <List>
          {userData.recentVotes?.map((vote, index) => (
            <ListItem key={index} divider={index !== (userData.recentVotes?.length || 0) - 1}>
              <ListItemText
                primary={vote.pollName}
                secondary={`Voted: ${vote.vote} • ${new Date(vote.timestamp).toLocaleString()}`}
              />
            </ListItem>
          )) || (
            <ListItem>
              <ListItemText primary="No recent votes" />
            </ListItem>
          )}
        </List>
      </Box>

      {userData.settings.isPolitician && (
        <Box sx={{ mt: 4 }}>
          <Button
            variant="contained"
            onClick={handleDelegateVotes}
            disabled={isDelegating || !privacyAccepted}
            fullWidth
          >
            {isDelegating ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Delegating...
              </>
            ) : (
              'Delegate My Votes to This User'
            )}
          </Button>
        </Box>
      )}
    </Paper>
  );
}

export default UserProfile; 