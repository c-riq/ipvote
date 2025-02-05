import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  Button, 
  Checkbox, 
  FormControlLabel, 
  Alert, 
  CircularProgress,
  Box,
  LinearProgress,
  Typography,
  FormControl,
  FormGroup,
  FormLabel,
  Paper,
  Popover,
  Tooltip,
  TextField
} from '@mui/material'
import Plot from 'react-plotly.js'
import DownloadIcon from '@mui/icons-material/Download'
import FilterListIcon from '@mui/icons-material/FilterList'
import PrivacyAccept from './ui/PrivacyAccept'
import VoteMap from './VoteMap'
import IPBlockMap from './IPBlockMap'
import IPv6BlockMap from './IPv6BlockMap'
import ASNTreemap from './ASNTreemap'
import { IpInfoResponse, PhoneVerificationState } from '../App'
import { triggerLatencyMeasurementIfNeeded } from '../utils/latencyTriangulation'
import { parseCSV, hasRequiredFields } from '../utils/csvParser'
import { POLL_DATA_HOST, POPULAR_POLLS_HOST, SUBMIT_VOTE_HOST } from '../constants'

interface VoteHistory {
  date: string;
  votes: { [key: string]: number };
}

interface ASNData {
  name: string
  value: number
  option: string
}

interface VoteData {
  time: string;
  masked_ip: string;
  poll: string;
  vote: string;
  country?: string;
  nonce?: string;
  country_geoip?: string;
  asn_name_geoip?: string;
  is_tor?: string;
  is_vpn?: string;
  is_cloud_provider?: string;
  custom_option?: string;
}

interface PollProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
  onPrivacyAcceptChange: (accepted: boolean, captchaToken?: string) => void
  phoneVerification: PhoneVerificationState | null
}
/* voting data schema:
time,masked_ip,poll,vote,country,nonce,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider
1730623803558,12.158.241.XXX,harris_or_trump,trump,,,TW,HostingInside LTD.,0,1,
1730763791706,52.194.133.XXX,harris_or_trump,harris,,,US,Amazon.com%2C Inc.,0,1,aws:us-east-1
1731672863490,62.126.89.XXX,harris_or_trump,trump,,,BG,Vivacom Bulgaria EAD,0,0,
*/

// Add this outside the component to create a global cache
const resultsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes in milliseconds

function Poll({ privacyAccepted, userIpInfo, captchaToken, 
    setCaptchaToken, onPrivacyAcceptChange, phoneVerification }: PollProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [poll, setPoll] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ [key: string]: number }>({})
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [includeTor, setIncludeTor] = useState(false)
  const [includeVpn, setIncludeVpn] = useState(false)
  const [includeCloud, setIncludeCloud] = useState(false)
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [votesByCountry, setVotesByCountry] = useState<{ [key: string]: { [option: string]: number } }>({})
  const [allVotes, setAllVotes] = useState<string[]>([])
  const [asnData, setAsnData] = useState<ASNData[]>([])
  const [chartZoomEnabled, setChartZoomEnabled] = useState(false);
  const [filteredVotes, setFilteredVotes] = useState<VoteData[]>([])
  const [measuringLatency, setMeasuringLatency] = useState(false);
  const [requireCaptcha, setRequireCaptcha] = useState(false)
  const [isOpenPoll, setIsOpenPoll] = useState(false)
  const [customOption, setCustomOption] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  useEffect(() => {
    setRequireCaptcha(allVotes.length > 1000)
  }, [allVotes])

  const allowVote = privacyAccepted ? requireCaptcha ? !!captchaToken : true : false

  useEffect(() => {
    // Get poll ID from URL path only
    const pathParts = location.pathname.split('/')
    const isOpen = pathParts[1] === 'open'
    setIsOpenPoll(isOpen)
    const pollFromPath = decodeURIComponent(isOpen ? pathParts[2] : pathParts[1])
    
    if (pollFromPath.includes('.')) {
      navigate('/')
      return
    }

    if (pollFromPath) {
      setPoll(pollFromPath)
      if (poll !== pollFromPath) {
        fetchResults(pollFromPath, true, isOpen)
      }
    }
  }, [location])

  useEffect(() => {
    if (allVotes.length > 0 && poll) {
      processVotes(allVotes)
    }
  }, [includeTor, includeVpn, includeCloud, allVotes, poll])

  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterAnchorEl(event.currentTarget)
  }

  const handleFilterClose = () => {
    setFilterAnchorEl(null)
  }

  const filterOpen = Boolean(filterAnchorEl)

  const fetchResults = async (pollId: string, refresh: boolean = true, isOpen: boolean = false) => {
    try {
      const now = Date.now();

      // Skip cache checks if refresh is true
      if (!refresh) {
        // Check memory cache first
        const cachedData = resultsCache[pollId];
        if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
          setAllVotes(cachedData.data);
          processVotes(cachedData.data);
          return;
        }

        // Check localStorage cache
        const localStorageKey = `poll_results_${pollId}`;
        const storedData = localStorage.getItem(localStorageKey);
        if (storedData) {
          const { data, timestamp } = JSON.parse(storedData);
          if ((now - timestamp) < CACHE_DURATION) {
            setAllVotes(data);
            processVotes(data);
            resultsCache[pollId] = { data, timestamp }; // Update memory cache
            return;
          }
        }
      }

      // Fetch fresh data
      const response = await fetch(`${POLL_DATA_HOST}/?poll=${pollId}&refresh=${refresh}&isOpen=${isOpen}`);
      if (response.status === 200) {
        const text = await response.text();
        const allVoteData = text.split('\n').filter(line => line.trim());
        
        // Update both caches
        resultsCache[pollId] = { data: allVoteData, timestamp: now };
        localStorage.setItem(`poll_results_${pollId}`, JSON.stringify({ data: allVoteData, timestamp: now }));
        
        setAllVotes(allVoteData);
        processVotes(allVoteData);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
    }
  }

  const processVotes = (voteData: string[]) => {
    const parsed = parseCSV(voteData).filter(row => 
      hasRequiredFields(row, ['time', 'masked_ip', 'poll', 'vote'])
    ) as unknown as VoteData[];

    // Filter based on user preferences
    const filteredVotes = parsed.filter(vote => {
      return (includeTor || vote.is_tor !== '1') && 
             (includeVpn || vote.is_vpn !== '1') && 
             (includeCloud || !vote.is_cloud_provider?.trim());
    });

    setFilteredVotes(filteredVotes);

    // Process current totals
    if (isOpenPoll) {
      const voteCounts: { [key: string]: number } = {};
      filteredVotes.forEach(vote => {
        const option = vote.custom_option || vote.vote;
        voteCounts[option] = (voteCounts[option] || 0) + 1;
      });
      setResults(voteCounts);
    } else if (poll.includes('_or_')) {
      const options = poll.split('_or_');
      const option1Votes = filteredVotes.filter(vote => vote.vote === options[0]).length;
      const option2Votes = filteredVotes.filter(vote => vote.vote === options[1]).length;
      setResults({ [options[0]]: option1Votes, [options[1]]: option2Votes });
    } else {
      const yesVotes = filteredVotes.filter(vote => vote.vote === 'yes').length;
      const noVotes = filteredVotes.filter(vote => vote.vote === 'no').length;
      setResults({ yes: yesVotes, no: noVotes });
    }

    // Process votes by country
    const countryVotes: { [key: string]: { [option: string]: number } } = {};
    filteredVotes.forEach(vote => {
      const country = vote.country_geoip;
      if (country && country !== 'XX') {
        if (!countryVotes[country]) {
          countryVotes[country] = {};
        }
        countryVotes[country][vote.vote] = (countryVotes[country][vote.vote] || 0) + 1;
      }
    });
    setVotesByCountry(countryVotes);

    // Process historical data
    const dailyVotes: { [key: string]: { [key: string]: number } } = {};
    filteredVotes.forEach(vote => {
      try {
        const date = new Date(vote.time).toISOString().split('T')[0];
        
        if (!dailyVotes[date]) {
          dailyVotes[date] = {};
        }
        dailyVotes[date][vote.vote] = (dailyVotes[date][vote.vote] || 0) + 1;
      } catch (error) {
        console.warn('Invalid timestamp in vote:', vote);
      }
    });

    const history = Object.entries(dailyVotes)
      .map(([date, votes]) => ({
        date,
        votes
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setVoteHistory(history);

    // Process ASN data
    const asnVotes: { [key: string]: { [option: string]: number } } = {};
    filteredVotes.forEach(vote => {
      const asn_name = vote.asn_name_geoip;
      if (asn_name && asn_name !== '') {
        const decodedName = decodeURIComponent(asn_name);
        if (!asnVotes[decodedName]) {
          asnVotes[decodedName] = {};
        }
        asnVotes[decodedName][vote.vote] = (asnVotes[decodedName][vote.vote] || 0) + 1;
      }
    });

    // Convert to array format for treemap
    const asnArray: ASNData[] = [];
    Object.entries(asnVotes).forEach(([name, votes]) => {
      Object.entries(votes).forEach(([option, count]) => {
        asnArray.push({ name, value: count, option });
      });
    });
    setAsnData(asnArray);
  }

  const handleVote = async (vote: string) => {
    setLoading(true)
    try {
      const votePayload = isOpenPoll && showCustomInput ? customOption : vote
      const phoneNumber = phoneVerification?.phoneNumber
      const phoneToken = phoneVerification?.token
      const params = new URLSearchParams({
        poll: poll,
        vote: votePayload,
        captchaToken: captchaToken || ''
      });

      if (isOpenPoll) {
        params.append('isOpen', 'true');
      }
      
      if (phoneNumber) {
        params.append('phoneNumber', phoneNumber);
      }
      
      if (phoneToken) {
        params.append('phoneToken', phoneToken);
      }

      const response = await fetch(`${SUBMIT_VOTE_HOST}/?${params.toString()}`);
      const data = await response.text()
      if (response.status === 200) {
        setMessage('Vote submitted successfully!')
        // Trigger updating popular polls
        fetch(
          `${POPULAR_POLLS_HOST}/?limit=15&offset=0&seed=1&q=&pollToUpdate=${encodeURIComponent(poll)}`
        )
        if (userIpInfo?.ip && requireCaptcha) {
          setMeasuringLatency(true)
          await triggerLatencyMeasurementIfNeeded(userIpInfo.ip)
          setMeasuringLatency(false)
        }
      } else {
        setMessage(JSON.parse(data)?.message || data)
        if (data.includes('captcha')) {
          setCaptchaToken('')
        }
      }
      fetchResults(poll, true, isOpenPoll)
    } catch (error) {
      setMessage('Error submitting vote')
    }
    setLoading(false)
  }

  const renderResults = () => {
    if (Object.keys(results).length === 0) return null;
    
    const totalVotes = Object.values(results).reduce((a, b) => a + b, 0);
    
    return Object.entries(results).map(([option, count]) => {
      const percentage = (count / totalVotes) * 100;
      return (
        <Box key={option} sx={{ 
          mb: 2,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2
        }}>
          <Box sx={{ 
            flex: 1,
            order: { xs: 1, sm: 2 }
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography>{count} votes</Typography>
              <Typography>{percentage.toFixed(2)}%</Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={percentage}
              sx={{
                height: 20,
                borderRadius: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'primary.main',
                }
              }}
            />
          </Box>
          <Tooltip 
            title={!privacyAccepted ? "Please accept the privacy policy first" : 
                  (requireCaptcha && !captchaToken) ? "Please complete the captcha verification" : ""}
            arrow
            disableHoverListener={allowVote}
            disableFocusListener={allowVote}
            disableTouchListener={allowVote}
            placement="top"
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <div style={{ display: 'inline-block' }}>
              <Button
                variant="contained"
                disabled={!allowVote}
                onClick={() => handleVote(option)}
                sx={{ 
                  minWidth: '100px',
                  order: { xs: 2, sm: 1 },
                  width: { xs: '100%', sm: 'auto' },
                  '&.Mui-disabled': {
                    pointerEvents: 'auto'
                  }
                }}
              >
                {option}
              </Button>
            </div>
          </Tooltip>
        </Box>
      );
    });
  };

  const renderVoteHistory = () => {
    if (voteHistory.length === 0) return null

    const options = isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])
    const traces = options.map((option) => {
      // Generate consistent color for each option
      const hash = [...option].reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
      }, 0);
      const h = Math.abs(hash % 360);
      
      return {
        x: voteHistory.map(day => day.date),
        y: voteHistory.map(day => day.votes[option] || 0),
        name: option,
        type: 'scatter' as const,
        mode: 'lines' as const,
        line: {
          // Use consistent colors with other visualizations
          color: options.length === 2 ? 
            (option === options[0] ? '#4169E1' : '#ff6969') : // Binary choice
            `hsl(${h}, 70%, 50%)` // Multiple options
        }
      }
    })

    return (
      <Box sx={{ mt: 4 }}>
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            variant={chartZoomEnabled ? "contained" : "outlined"}
            onClick={() => setChartZoomEnabled(!chartZoomEnabled)}
          >
            {chartZoomEnabled ? "Disable Zoom" : "Enable Zoom"}
          </Button>
        </Box>
        <Box sx={{ height: '300px' }}>
          <Plot
            data={traces}
            layout={{
              title: 'Votes over time',
              autosize: true,
              margin: { t: 30, r: 10, b: 30, l: 40 },
              xaxis: {
                title: 'Date',
                showgrid: false,
                fixedrange: !chartZoomEnabled
              },
              yaxis: {
                title: 'Votes',
                showgrid: true,
                fixedrange: !chartZoomEnabled
              },
              showlegend: true,
              legend: {
                x: 0,
                y: 1,
                orientation: 'h'
              },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              dragmode: chartZoomEnabled ? 'zoom' : false,
              hovermode: 'x unified'
            }}
            config={{
              displayModeBar: true,
              scrollZoom: false,
              doubleClick: false,
              displaylogo: false,
              modeBarButtonsToRemove: [
                'pan2d',
                'select2d',
                'lasso2d',
                'autoScale2d',
                'resetScale2d',
                'zoom2d',
                'zoomIn2d',
                'zoomOut2d'
              ],
              responsive: true,
              toImageButtonOptions: {
                format: 'png',
                filename: 'vote_history'
              }
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </Box>
      </Box>
    )
  }

  const renderVoteButtons = () => {
    if (isOpenPoll) {
      const existingOptions = Object.entries(results)
        .sort(([,a], [,b]) => b - a) // Sort by vote count descending
        .map(([option, count]) => {
          const percentage = count / Object.values(results).reduce((a, b) => a + b, 0) * 100;
          return (
            <Box key={option} sx={{ mb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 2 }}>
              <Box sx={{ flex: 1, order: { xs: 1, sm: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography>{count} votes</Typography>
                  <Typography>{percentage.toFixed(2)}%</Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={percentage}
                  sx={{
                    height: 20,
                    borderRadius: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'primary.main',
                    }
                  }}
                />
              </Box>
              <Tooltip 
                title={!privacyAccepted ? "Please accept the privacy policy first" : 
                      (requireCaptcha && !captchaToken) ? "Please complete the captcha verification" : ""}
                arrow
                disableHoverListener={allowVote}
                disableFocusListener={allowVote}
                disableTouchListener={allowVote}
                placement="top"
              >
                <div style={{ display: 'inline-block' }}>
                  <Button
                    variant="contained"
                    disabled={!allowVote}
                    onClick={() => handleVote(option)}
                    sx={{ 
                      minWidth: '100px',
                      order: { xs: 2, sm: 1 },
                      width: { xs: '100%', sm: 'auto' },
                      textTransform: 'none'
                    }}
                  >
                    {option}
                  </Button>
                </div>
              </Tooltip>
            </Box>
          );
        });

      return (
        <>
          {Object.keys(results).length > 0 ? existingOptions : (
            <Typography variant="body1" sx={{ mb: 2 }}>
              No votes yet. Be the first to vote!
            </Typography>
          )}
          {!showCustomInput ? (
            <Button
              variant="outlined"
              onClick={() => setShowCustomInput(true)}
              sx={{ mt: 2, mb: 4 }}
            >
              Add New Option
            </Button>
          ) : (
            <Box sx={{ mt: 2, mb: 4 }}>
              <TextField
                fullWidth
                value={customOption}
                onChange={(e) => setCustomOption(e.target.value)}
                placeholder="Enter your option"
                sx={{ mb: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  disabled={!allowVote || !customOption.trim()}
                  onClick={() => handleVote(customOption)}
                >
                  Submit
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setShowCustomInput(false)
                    setCustomOption('')
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </>
      );
    }

    if (Object.keys(results).length > 0) {
      return renderResults();
    }

    // For new polls with no results yet
    const options = poll.includes('_or_') 
      ? poll.split('_or_')
      : ['yes', 'no'];

    return options.map(option => (
      <Box key={option} sx={{ 
        mb: 2,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 2
      }}>
        <Box sx={{ 
          flex: 1,
          order: { xs: 1, sm: 2 }
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography>0 votes</Typography>
            <Typography>0%</Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={0}
            sx={{
              height: 20,
              borderRadius: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'primary.main',
              }
            }}
          />
        </Box>
        <Tooltip 
          title={!privacyAccepted ? "Please accept the privacy policy first" : 
                (requireCaptcha && !captchaToken) ? "Please complete the captcha verification" : ""}
          arrow
          disableHoverListener={allowVote}
          disableFocusListener={allowVote}
          disableTouchListener={allowVote}
          placement="top"
          enterTouchDelay={0}
          leaveTouchDelay={5000}
        >
          <div style={{ display: 'inline-block' }}>
            <Button
              variant="contained"
              disabled={!allowVote}
              onClick={() => handleVote(option)}
              sx={{ 
                minWidth: '100px',
                order: { xs: 2, sm: 1 },
                width: { xs: '100%', sm: 'auto' },
                '&.Mui-disabled': {
                  pointerEvents: 'auto'
                }
              }}
            >
              {option}
            </Button>
          </div>
        </Tooltip>
      </Box>
    ));
  };

  const downloadPollData = () => {
    if (!poll) return;
    
    // Direct download from the API endpoint
    window.open(`${POLL_DATA_HOST}/?poll=${poll}&refresh=true&isOpen=${isOpenPoll}`, '_blank');
  };

  return (
    <div className="content">
      <h1 style={{ wordBreak: 'break-word' }}>
        {poll.includes('_or_') ? poll.replace(/_/g, ' ') + '?' : poll.replace(/_/g, ' ')}
      </h1>
      
      {message && (
        <Alert 
          severity={message === 'Vote submitted successfully!' ? 'success' : 'warning'}
          sx={{ mb: 2 }}
        >
          {message}
          {measuringLatency && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CircularProgress size={16} />
              <span>Measuring network latency for geolocation. This may take a few seconds...</span>
            </div>
          )}
        </Alert>
      )}
      
      {!userIpInfo ? (
        <CircularProgress />
      ) : (
        <>
          <PrivacyAccept
            userIpInfo={userIpInfo}
            accepted={privacyAccepted}
            onAcceptChange={(accepted) => {
              onPrivacyAcceptChange(accepted)
            }}
            setCaptchaToken={setCaptchaToken}
            captchaToken={captchaToken}
            showCaptcha={requireCaptcha}
          />

          {loading ? (
            <CircularProgress />
          ) : (
            <div style={{ marginTop: '20px' }}>
              {renderVoteButtons()}
            </div>
          )}

          <Box sx={{ position: 'relative' }}>
            <Box sx={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              zIndex: 1 
            }}>
              <Button
                variant="outlined"
                onClick={handleFilterClick}
                startIcon={<FilterListIcon />}
                size="small"
              >
                Filter Results
              </Button>
              <Popover
                open={filterOpen}
                anchorEl={filterAnchorEl}
                onClose={handleFilterClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'left',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'left',
                }}
              >
                <Paper sx={{ p: 2 }}>
                  <FormControl component="fieldset">
                    <FormLabel component="legend">Filter Options</FormLabel>
                    <FormGroup>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includeTor}
                            onChange={(e) => {
                              setIncludeTor(e.target.checked);
                            }}
                          />
                        }
                        label="Include votes from Tor exit nodes"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includeVpn}
                            onChange={(e) => {
                              setIncludeVpn(e.target.checked);
                            }}
                          />
                        }
                        label="Include votes from VPN services"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includeCloud}
                            onChange={(e) => {
                              setIncludeCloud(e.target.checked);
                            }}
                          />
                        }
                        label="Include votes from cloud providers"
                      />
                    </FormGroup>
                  </FormControl>
                </Paper>
              </Popover>
            </Box>

            <div id="results"></div>
            {renderVoteHistory()}
          </Box>

          {Object.keys(results).length > 0 && (
            <>
              <VoteMap 
                votesByCountry={votesByCountry} 
                options={isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])} 
              />
              
              <ASNTreemap
                asnData={asnData}
                options={isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])}
              />
              
              <IPBlockMap
                votes={filteredVotes.map(v => ({
                  ip: v.masked_ip,
                  vote: isOpenPoll ? (v.custom_option || v.vote) : v.vote,
                  country: v.country_geoip,
                  asn_name_geoip: v.asn_name_geoip
                }))}
                options={isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])}
              />
              
              <IPv6BlockMap
                votes={filteredVotes.map(v => ({
                  ip: v.masked_ip,
                  vote: isOpenPoll ? (v.custom_option || v.vote) : v.vote,
                  country: v.country_geoip,
                  asn_name_geoip: v.asn_name_geoip
                }))}
                options={isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])}
              />
              
              <Box sx={{ mt: 2, mb: 4 }}>
                <Button
                  variant="outlined"
                  onClick={downloadPollData}
                  startIcon={<DownloadIcon />}
                >
                  Download Poll Data
                </Button>
              </Box>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Poll 