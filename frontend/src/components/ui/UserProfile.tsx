import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { IpInfoResponse } from '../../App';
import { DELEGATION_HOST, PUBLIC_PROFILES_HOST, VALID_TAGS } from '../../constants';
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
  recentVotes: {
    pollName: string;
    vote: string;
    timestamp: string;
  }[];
  delegatedTags: string[];
}

interface Delegation {
  target: string;
  category: string;
  timestamp: number;
}

interface DelegationStatus {
  myDelegations: Delegation[];
  theirDelegations: Delegation[];
}

function UserProfile({ privacyAccepted, onPrivacyAcceptChange, userIpInfo }: UserProfileProps) {
  const { userId } = useParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDelegating, setIsDelegating] = useState(false);
  const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>({
    myDelegations: [],
    theirDelegations: []
  });
  const [isDelegationsLoading, setIsDelegationsLoading] = useState(true);

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

  const fetchDelegationStatus = async () => {
    setIsDelegationsLoading(true);
    const sessionToken = localStorage.getItem('sessionToken');
    const sourceUserId = localStorage.getItem('userId');
    const sourceEmail = localStorage.getItem('userEmail');
    
    if (!sessionToken || !sourceUserId || !sourceEmail) return;

    try {
      // Fetch my delegations
      const myResponse = await fetch(`${DELEGATION_HOST}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list',
          source: sourceUserId,
          email: sourceEmail,
          sessionToken
        }),
      });

      // Fetch their delegations
      const theirResponse = await fetch(`${DELEGATION_HOST}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list',
          source: userId,
          email: sourceEmail,
          sessionToken
        }),
      });

      if (!myResponse.ok || !theirResponse.ok) {
        throw new Error('Failed to fetch delegation status');
      }

      const myData = await myResponse.json();
      const theirData = await theirResponse.json();

      setDelegationStatus({
        myDelegations: myData.delegations || [],
        theirDelegations: theirData.delegations || []
      });
    } catch (error) {
      console.error('Error fetching delegation status:', error);
    } finally {
      setIsDelegationsLoading(false);
    }
  };

  useEffect(() => {
    if (userData) {
      fetchDelegationStatus();
    }
  }, [userData]);

  const handleDelegateVotes = async (category: string) => {
    if (!privacyAccepted) {
      setError('Please accept the privacy policy first');
      return;
    }

    setIsDelegating(true);
    setError(null);

    try {
      const sessionToken = localStorage.getItem('sessionToken');
      const sourceUserId = localStorage.getItem('userId');
      const sourceEmail = localStorage.getItem('userEmail');
      if (!sessionToken || !sourceUserId) {
        throw new Error('Please log in to delegate votes');
      }

      const action = delegationStatus.myDelegations.find(d => d.category === category) ? 'revoke' : 'delegate';

      const response = await fetch(`${DELEGATION_HOST}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          source: sourceUserId,
          email: sourceEmail,
          sessionToken,
          target: userId,
          category
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update delegation');
      }

      await Promise.all([
        fetchDelegationStatus(),
        fetchUserProfile()
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update delegation');
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
        Public Profile
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
          Vote Delegations
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Your Delegation</TableCell>
                <TableCell>Their Delegation</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isDelegationsLoading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    Loading delegation data...
                  </TableCell>
                </TableRow>
              ) : (
                VALID_TAGS.map((tag) => {
                  const myDelegation = delegationStatus.myDelegations.find(d => d.category === tag);
                  const theirDelegation = delegationStatus.theirDelegations.find(d => d.category === tag);
                  const isDelegatedToUser = myDelegation?.target === userId;

                  return (
                    <TableRow key={tag}>
                      <TableCell>{tag}</TableCell>
                      <TableCell>
                        {isDelegatedToUser ? (
                          <Typography variant="body2" color="primary">
                            Delegated to this user
                          </Typography>
                        ) : myDelegation ? (
                          <Typography variant="body2" color="text.secondary">
                            Delegated to{' '}
                            <Link 
                              to={`/profile/${myDelegation.target}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <Button
                                size="small"
                                variant="text"
                                color="primary"
                              >
                                {myDelegation.target}
                              </Button>
                            </Link>
                          </Typography>
                        ) : (
                          'Not delegated'
                        )}
                      </TableCell>
                      <TableCell>
                        {theirDelegation ? (
                          <Typography variant="body2" color="primary">
                            Delegated to{' '}
                            <Link 
                              to={`/profile/${theirDelegation.target}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <Button
                                size="small"
                                variant="text"
                                color="primary"
                              >
                                {theirDelegation.target}
                              </Button>
                            </Link>
                          </Typography>
                        ) : (
                          'Not delegated'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant={isDelegatedToUser ? "outlined" : "contained"}
                          color={isDelegatedToUser ? "secondary" : "primary"}
                          onClick={() => handleDelegateVotes(tag)}
                          disabled={isDelegating || !privacyAccepted || (myDelegation && !isDelegatedToUser)}
                        >
                          {isDelegating ? (
                            <>
                              <CircularProgress size={20} sx={{ mr: 1 }} />
                              Updating...
                            </>
                          ) : isDelegatedToUser ? (
                            'Revoke'
                          ) : myDelegation ? (
                            'Delegated Elsewhere'
                          ) : (
                            'Delegate'
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {!privacyAccepted && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Please accept the privacy policy to delegate votes.
          </Alert>
        )}
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
    </Paper>
  );
}

export default UserProfile; 