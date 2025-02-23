import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Box,
  Button,
  Typography,
  Link
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { POLL_DATA_HOST } from '../constants';
import { parseCSV, hasRequiredFields } from '../utils/csvParser';
import { Link as RouterLink } from 'react-router-dom';

interface VoteData {
  time: string;
  masked_ip: string;
  poll: string;
  vote: string;
  country_geoip?: string;
  asn_name_geoip?: string;
  is_tor?: string;
  is_vpn?: string;
  is_cloud_provider?: string;
  phone_number?: string;
  user_id?: string;
  delegated_votes?: string;
  custom_option?: string;
}

function VoteTable() {
  const { pollId, isOpen } = useParams();
  const [votes, setVotes] = useState<VoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    fetchVoteData();
  }, [pollId]);

  const fetchVoteData = async () => {
    if (!pollId) return;
    
    try {
      const response = await fetch(`${POLL_DATA_HOST}/?poll=${pollId}&refresh=true&isOpen=${isOpen === 'true'}`);
      if (response.ok) {
        const text = await response.text();
        const rows = text.split('\n').filter(line => line.trim());
        const parsedVotes = parseCSV(rows).filter(row => 
          hasRequiredFields(row, ['time', 'masked_ip', 'poll', 'vote'])
        ) as unknown as VoteData[];
        setVotes(parsedVotes);
      }
    } catch (error) {
      console.error('Error fetching vote data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const downloadData = () => {
    if (!pollId) return;
    window.open(`${POLL_DATA_HOST}/?poll=${pollId}&refresh=true&isOpen=${isOpen === 'true'}`, '_blank');
  };

  const getCountryFlag = (countryCode: string) => {
    // Convert country code to regional indicator symbols (flag emoji)
    return countryCode
      ? countryCode
          .toUpperCase()
          .replace(/./g, char => 
            String.fromCodePoint(char.charCodeAt(0) + 127397)
          )
      : '';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Vote Data</Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={downloadData}
        >
          Download CSV
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Masked IP</TableCell>
              <TableCell>Vote</TableCell>
              <TableCell>Country</TableCell>
              <TableCell>ASN</TableCell>
              <TableCell>VPN</TableCell>
              <TableCell>Tor</TableCell>
              <TableCell>Cloud</TableCell>
              <TableCell>User</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {votes
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((vote, index) => (
                <TableRow key={index}>
                  <TableCell>{new Date(vote.time).toLocaleString()}</TableCell>
                  <TableCell>{vote.masked_ip.replace(/XXXX:XXXX:XXXX$/g, '...')}</TableCell>
                  <TableCell>{vote.custom_option || vote.vote}</TableCell>
                  <TableCell>
                    {vote.country_geoip 
                      ? `${getCountryFlag(vote.country_geoip)} ${vote.country_geoip}` 
                      : '-'}
                  </TableCell>
                  <TableCell>{(vote.asn_name_geoip || '-').replace(/%2C/g, ',')}</TableCell>
                  <TableCell>{vote.is_vpn === '1' ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{vote.is_tor === '1' ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{vote.is_cloud_provider ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    {vote.user_id ? (
                      <Link component={RouterLink} to={`/ui/user/${vote.user_id}`}>
                        {vote.user_id}
                      </Link>
                    ) : '-'}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        component="div"
        count={votes.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Box>
  );
}

export default VoteTable; 