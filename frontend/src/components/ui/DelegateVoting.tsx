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
  Button,
} from '@mui/material';
import { Link } from 'react-router-dom';
import PrivacyAccept from './PrivacyAccept';
import { IpInfoResponse, PhoneVerificationState } from '../../App';
import { DELEGATION_HOST, PUBLIC_PROFILES_HOST } from '../../constants';
import Plot from 'react-plotly.js';

interface DelegateVotingProps {
  privacyAccepted: boolean;
  onPrivacyAcceptChange: (accepted: boolean) => void;
  userIpInfo: IpInfoResponse | null;
  phoneVerification: PhoneVerificationState | null;
  captchaToken?: string;
  setCaptchaToken?: (token: string) => void;
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
  captchaToken,
  setCaptchaToken,
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

  const renderDelegationGraph = () => {
    if (delegations.length === 0) return null;

    const sourceUserId = localStorage.getItem('userId');
    if (!sourceUserId) return null;

    // Prepare data for the graph
    const nodes = new Set([sourceUserId]);
    delegations.forEach(d => {
      nodes.add(d.target);
    });

    const nodesList = Array.from(nodes);
    
    // Create x and y coordinates in a circular layout
    const radius = 1;
    const angleStep = (2 * Math.PI) / nodesList.length;
    const coordinates = nodesList.reduce((acc, _, index) => {
      acc.x.push(radius * Math.cos(index * angleStep));
      acc.y.push(radius * Math.sin(index * angleStep));
      return acc;
    }, { x: [] as number[], y: [] as number[] });

    const data = [
      // Nodes only
      {
        type: 'scatter' as const,
        x: coordinates.x,
        y: coordinates.y,
        mode: 'markers+text',
        marker: {
          size: 20,
          color: nodesList.map(id => id === sourceUserId ? '#4169E1' : '#ff6969'),
        },
        text: nodesList.map(id => {
          const profile = publicProfiles[id];
          return profile?.settings.firstName 
            ? `${profile.settings.firstName} ${profile.settings.lastName}`
            : id;
        }),
        textposition: 'bottom center' as const,
        hoverinfo: 'text',
      },
    ];

    // Create annotations for arrows
    const annotations = delegations.map(d => {
      const sourceIndex = nodesList.indexOf(sourceUserId);
      const targetIndex = nodesList.indexOf(d.target);
      
      return {
        x: coordinates.x[targetIndex],
        y: coordinates.y[targetIndex],
        xref: 'x' as const,
        yref: 'y' as const,
        ax: coordinates.x[sourceIndex],
        ay: coordinates.y[sourceIndex],
        axref: 'x' as const,
        ayref: 'y' as const,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowwidth: 2,
        arrowcolor: '#888'
      };
    });

    return (
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Delegation Graph
        </Typography>
        <Box sx={{ height: '400px' }}>
          <Plot
            // @ts-ignore
            data={data}
            layout={{
              showlegend: false,
              hovermode: 'closest',
              autosize: true,
              margin: { t: 40, r: 40, b: 80, l: 40 },
              xaxis: {
                showgrid: false,
                zeroline: false,
                showticklabels: false,
                range: [-1.5, 1.5],
              },
              yaxis: {
                showgrid: false,
                zeroline: false,
                showticklabels: false,
                range: [-1.5, 1.5],
              },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              annotations: annotations,
            }}
            config={{
              displayModeBar: false,
              responsive: true,
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </Box>
      </Paper>
    );
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
      <Alert severity="warning" sx={{ mb: 2 }}>
        This feature is currently in beta.
      </Alert>

      <Typography variant="h4" gutterBottom>
        Vote Delegation
      </Typography>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        setCaptchaToken={setCaptchaToken || (() => {})}
        captchaToken={captchaToken}
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
                <TableCell>Action</TableCell>
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
                    <Button
                      variant="contained"
                      size="small"
                      component={Link}
                      to={`/ui/user/${userId}`}
                    >
                      View Profile
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {renderDelegationGraph()}
    </div>
  );
}

export default DelegateVoting; 