import { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  Alert,
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Link } from 'react-router-dom';
import PrivacyAccept from './PrivacyAccept';
import { IpInfoResponse } from '../../App';
import { DELEGATION_HOST, PUBLIC_PROFILES_HOST } from '../../constants';

interface DelegateVotingProps {
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean) => void;
  userIpInfo: IpInfoResponse | null;
}

interface Delegation {
  target: string;
  category: string;
  timestamp: number;
}

interface PublicProfile {
  email: string;
  settings: {
    isPolitician: boolean;
    firstName?: string;
    lastName?: string;
    country?: string;
  };
  delegatedVotes: number;
}

function DelegateVoting({ 
  privacyAccepted, 
  onPrivacyAcceptChange, 
  userIpInfo,
}: DelegateVotingProps) {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<Record<string, PublicProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDelegations();
    fetchPublicProfiles();
  }, []);

  const fetchDelegations = async () => {
    const sessionToken = localStorage.getItem('sessionToken');
    const sourceUserId = localStorage.getItem('userId');
    const sourceEmail = localStorage.getItem('userEmail');
    
    if (!sessionToken || !sourceUserId || !sourceEmail) {
      setError('Please log in to view delegations');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${DELEGATION_HOST}`, {
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

      if (!response.ok) {
        throw new Error('Failed to fetch delegations');
      }

      const data = await response.json();
      setDelegations(data.delegations || []);
    } catch (error) {
      console.error('Error fetching delegations:', error);
      setError('Failed to load delegations');
    } finally {
      setLoading(false);
    }
  };

  const fetchPublicProfiles = async () => {
    try {
      const response = await fetch(`${PUBLIC_PROFILES_HOST}index.json`);
      if (!response.ok) {
        throw new Error('Failed to fetch public profiles');
      }
      const data = await response.json();
      setPublicProfiles(data);
    } catch (error) {
      console.error('Error fetching public profiles:', error);
      setError('Failed to load public profiles');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h4" gutterBottom>
        Vote Delegation
      </Typography>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
      />

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Your Current Delegations
        </Typography>
        
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Delegated To</TableCell>
                <TableCell>Since</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {delegations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography color="textSecondary">
                      No active delegations
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                delegations.map((delegation) => (
                  <TableRow key={delegation.category}>
                    <TableCell>{delegation.category}</TableCell>
                    <TableCell>
                      <Link 
                        to={`/ui/user/${delegation.target}`}
                        style={{ textDecoration: 'none' }}
                      >
                        {publicProfiles[delegation.target]?.settings.firstName
                          ? `${publicProfiles[delegation.target].settings.firstName} ${publicProfiles[delegation.target].settings.lastName}`
                          : delegation.target}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {new Date(delegation.timestamp).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Public Profiles
        </Typography>
        
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Delegated Votes</TableCell>
                <TableCell>Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(publicProfiles).map(([userId, profile]) => (
                <TableRow key={userId}>
                  <TableCell>
                    <Link 
                      to={`/ui/user/${userId}`}
                      style={{ textDecoration: 'none' }}
                    >
                      {profile.settings.firstName
                        ? `${profile.settings.firstName} ${profile.settings.lastName}`
                        : profile.email}
                    </Link>
                  </TableCell>
                  <TableCell>{profile.settings.country || '-'}</TableCell>
                  <TableCell>{profile.delegatedVotes}</TableCell>
                  <TableCell>
                    {profile.settings.isPolitician ? 'Politician' : 'Voter'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
}

export default DelegateVoting; 