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
  TextField,
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
import { parseCSV, hasRequiredFields } from '../utils/csvParser'
import { CAPTCHA_THRESHOLD, IPVOTES_S3_BUCKET_HOST, POLL_DATA_HOST, POPULAR_POLLS_HOST } from '../constants'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PollMetadata from './PollMetadata'
import SearchIcon from '@mui/icons-material/Search'
import { Helmet } from 'react-helmet-async'
import { submitVote } from '../api/vote'

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
  phone_number?: string;
  user_id?: string;
  delegated_votes?: string;
  delegated_votes_from_verified_phone_numbers?: string;
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
time,masked_ip,poll,vote,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider,closest_region,latency_ms,roundtrip_ms,captcha_verified,phone_number,user_id,delegated_votes,delegated_votes_from_verified_phone_numbers
1739714961914,79.135.10X.XXX,a_or_t,t,FR,Datacamp Limited,0,1,,,,,0,,,0,0
1739970815565,87.210.02X.XXX,a_or_t,t,NL,Odido Netherlands B.V.,0,0,,,,,0,+4915234XXXXXX,4e47d8456fd684e27a78d2d513e037fc,2,2
*/

// Add this outside the component to create a global cache
const resultsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes in milliseconds

// Add this helper function after the interface definitions
const computeFileHash = async (pdfBlob: Blob): Promise<string> => {
  const buffer = await pdfBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  // Convert to base64 and make URL safe
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
};

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
  const [includePhoneVerifiedOnly, setIncludePhoneVerifiedOnly] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [showAdvancedMaps, setShowAdvancedMaps] = useState(false);
  const [includeRegisteredUsersOnly, setIncludeRegisteredUsersOnly] = useState(false)
  const [pdfHashValid, setPdfHashValid] = useState<boolean | null>(null);

  useEffect(() => {
    setRequireCaptcha(allVotes.length > CAPTCHA_THRESHOLD)
  }, [allVotes])

  const allowVote = privacyAccepted ? requireCaptcha ? !!captchaToken : true : false

  useEffect(() => {
    // Get poll ID from URL path only
    const pathParts = location.pathname.split('/')
    const isOpen = pathParts[1] === 'open'
    setIsOpenPoll(isOpen)
    let pollFromPath = decodeURIComponent(isOpen ? pathParts[2] : pathParts[1])
    
    // Only redirect if the poll name ends with specific file extensions
    if (/\.(html|js|css|jpg)$/i.test(pollFromPath)) {
      navigate('/')
      return
    }

    if (pollFromPath) {
      setPoll(pollFromPath)  // Store full poll ID including attachment
      if (poll !== pollFromPath) {
        fetchResults(pollFromPath, true, isOpen)
      }
    }
  }, [location])

  // Move PDF hash validation effect here, before any conditional effects
  useEffect(() => {
    if (poll) {
      const attachmentMatch = poll.match(/(.+)_attachment_([A-Za-z0-9_-]{43})$/)
      if (attachmentMatch) {
        const hash = attachmentMatch[2]
        const pdfUrl = `${IPVOTES_S3_BUCKET_HOST}/poll_attachments/${hash}.pdf`
        validatePdfHash(pdfUrl, hash)
      } else {
        setPdfHashValid(null)
      }
    }
  }, [poll])

  useEffect(() => {
    if (allVotes.length > 0 && poll) {
      processVotes(allVotes)
    }
  }, [includeTor, includeVpn, includeCloud, includePhoneVerifiedOnly, allVotes, poll, includeRegisteredUsersOnly])

  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterAnchorEl(event.currentTarget)
  }

  const handleFilterClose = () => {
    setFilterAnchorEl(null)
  }

  const filterOpen = Boolean(filterAnchorEl)

  const fetchResults = async (pollId: string, refresh: boolean = true, isOpen: boolean = false) => {
    setDataLoading(true)
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
    } finally {
      setDataLoading(false)
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
             (includeCloud || !vote.is_cloud_provider?.trim()) &&
             (!includePhoneVerifiedOnly || vote.phone_number) &&
             (!includeRegisteredUsersOnly || vote.user_id);
    });

    setFilteredVotes(filteredVotes);

    // Process current totals with delegation
    if (isOpenPoll) {
      const voteCounts: { [key: string]: number } = {};
      filteredVotes.forEach(vote => {
        const option = vote.custom_option || vote.vote;
        const weight = includeRegisteredUsersOnly ? 
          Number(vote.delegated_votes || 0) + 1 : 
          1;
        voteCounts[option] = (voteCounts[option] || 0) + weight;
      });
      setResults(voteCounts);
    } else if (poll.includes('_or_')) {
      const options = poll.split('_or_');
      const option1Votes = filteredVotes.reduce((sum, vote) => 
        vote.vote === options[0] ? 
          sum + (includeRegisteredUsersOnly ? Number(vote.delegated_votes || 0) + 1 : 1) : 
          sum, 
        0
      );
      const option2Votes = filteredVotes.reduce((sum, vote) => 
        vote.vote === options[1] ? 
          sum + (includeRegisteredUsersOnly ? Number(vote.delegated_votes || 0) + 1 : 1) : 
          sum, 
        0
      );
      setResults({ [options[0]]: option1Votes, [options[1]]: option2Votes });
    } else {
      const yesVotes = filteredVotes.reduce((sum, vote) => 
        vote.vote === 'yes' ? 
          sum + (includeRegisteredUsersOnly ? Number(vote.delegated_votes || 0) + 1 : 1) : 
          sum, 
        0
      );
      const noVotes = filteredVotes.reduce((sum, vote) => 
        vote.vote === 'no' ? 
          sum + (includeRegisteredUsersOnly ? Number(vote.delegated_votes || 0) + 1 : 1) : 
          sum, 
        0
      );
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

  const vote = async (vote: string) => {
    setLoading(true);
    setMeasuringLatency(true);
    
    try {
      const votePayload = isOpenPoll && showCustomInput ? customOption : vote;
      
      const response = await submitVote({
        poll,
        vote: votePayload,
        captchaToken: captchaToken || '',
        userIp: userIpInfo?.ip,
        phoneVerification,
        isOpen: isOpenPoll
      });

      setMessage(response.message);
      
      if (response.success) {
        // Trigger updating popular polls
        fetch(
          `${POPULAR_POLLS_HOST}/?limit=15&offset=0&seed=1&q=&pollToUpdate=${encodeURIComponent(poll)}`
        );
        fetchResults(poll, true, isOpenPoll);
      } else if (response.message.includes('captcha')) {
        setCaptchaToken('');
      }
    } catch (error) {
      setMessage('Error submitting vote');
    }
    
    setMeasuringLatency(false);
    setLoading(false);
  };

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
                onClick={() => vote(option)}
                sx={{ 
                  minWidth: '100px',
                  order: { xs: 2, sm: 1 },
                  width: { xs: '100%', sm: 'auto' },
                  '&.Mui-disabled': {
                    pointerEvents: 'auto'
                  },
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
  };

  const renderVoteHistory = () => {
    if (voteHistory.length === 0) return null

    const options = isOpenPoll ? Object.keys(results) : (poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no'])
    const traces = options.map((option, index) => {
      // For binary choices, keep original colors
      if (options.length === 2) {
        return {
          x: voteHistory.map(day => day.date),
          y: voteHistory.map(day => day.votes[option] || 0),
          name: option,
          type: 'scatter' as const,
          mode: 'lines' as const,
          line: {
            color: index === 0 ? '#4169E1' : '#ff6969'
          }
        }
      }

      // For multiple options, use golden ratio color generation
      const goldenRatio = 0.618033988749895
      const hue = (index * goldenRatio * 360) % 360
      const saturation = 70 + (index % 3) * 10
      const lightness = 45 + (index % 3) * 5
      
      return {
        x: voteHistory.map(day => day.date),
        y: voteHistory.map(day => day.votes[option] || 0),
        name: option,
        type: 'scatter' as const,
        mode: 'lines' as const,
        line: {
          color: `hsl(${hue}, ${saturation}%, ${lightness}%)`
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
        .sort(([,a], [,b]) => b - a)
        .map(([option, count]) => {
          const percentage = count / Object.values(results).reduce((a, b) => a + b, 0) * 100;
          const isUrl = poll === "Who should be world president?" && 
                       (option.startsWith('http://') || option.startsWith('https://'));

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
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1, 
                order: { xs: 2, sm: 1 },
                minWidth: { sm: '200px' }  // Added minimum width
              }}>
                {isUrl && (
                  <a href={option} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', display: 'flex', alignItems: 'center' }}>
                    <OpenInNewIcon fontSize="small" />
                  </a>
                )}
                <Tooltip title={!privacyAccepted ? "Please accept the privacy policy first" : 
                              (requireCaptcha && !captchaToken) ? "Please complete the captcha verification" : ""}>
                  <div style={{ display: 'inline-block', width: '100%' }}>
                    <Button
                      variant="contained"
                      disabled={!allowVote}
                      onClick={() => vote(option)}
                      sx={{ 
                        minWidth: '200px',  // Updated minimum width
                        width: { xs: '100%', sm: 'auto' },
                        textTransform: 'none',
                        whiteSpace: 'normal',
                        height: 'auto',
                        padding: '8px 16px',
                        lineHeight: 1.2
                      }}
                    >
                      {option}
                    </Button>
                  </div>
                </Tooltip>
              </Box>
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
                  onClick={() => vote(customOption)}
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
        <Box sx={{ 
          order: { xs: 2, sm: 1 },
          minWidth: { sm: '200px' }  // Added minimum width
        }}>
          <Tooltip title={!privacyAccepted ? "Please accept the privacy policy first" : 
                        (requireCaptcha && !captchaToken) ? "Please complete the captcha verification" : ""}>
            <div style={{ display: 'inline-block', width: '100%' }}>
              <Button
                variant="contained"
                disabled={!allowVote}
                onClick={() => vote(option)}
                sx={{ 
                  minWidth: '200px',  // Updated minimum width
                  width: { xs: '100%', sm: 'auto' },
                  '&.Mui-disabled': {
                    pointerEvents: 'auto'
                  },
                  whiteSpace: 'normal',
                  height: 'auto',
                  padding: '8px 16px',
                  lineHeight: 1.2
                }}
              >
                {option}
              </Button>
            </div>
          </Tooltip>
        </Box>
      </Box>
    ));
  };

  const viewPollData = () => {
    if (!poll) return;
    navigate(`/ui/votes/${encodeURIComponent(poll)}`);
  };

  // Add new function to validate PDF hash
  const validatePdfHash = async (pdfUrl: string, expectedHash: string) => {
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch PDF');
      }
      const pdfBlob = await response.blob();
      const actualHash = await computeFileHash(pdfBlob);
      setPdfHashValid(actualHash === expectedHash);
    } catch (error) {
      console.error('Error validating PDF hash:', error);
      setPdfHashValid(false);
    }
  };

  // Modify the renderAttachment function
  const renderAttachment = () => {
    const attachmentMatch = poll && poll.match(/(.+)_attachment_([A-Za-z0-9_-]{43})$/)
    if (!attachmentMatch) return null

    const hash = attachmentMatch[2]
    const pdfUrl = `${IPVOTES_S3_BUCKET_HOST}/poll_attachments/${hash}.pdf`
    
    // Check if browser is Chrome or Firefox
    const isChromium = window.navigator.userAgent.toLowerCase().includes('chrome')
    const isFirefox = window.navigator.userAgent.toLowerCase().includes('firefox')
    
    return (
      <Box sx={{ mt: 2, mb: 2 }}>
        {pdfHashValid === false && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Warning: The PDF hash does not match the reference in the poll.
          </Alert>
        )}
        
        {(isChromium || isFirefox) ? (
          <object
            data={pdfUrl}
            type="application/pdf"
            style={{
              width: '100%',
              height: '800px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.12)'
            }}
          >
            <Box sx={{ mt: 2, mb: 2 }}>
              <Button
                variant="outlined"
                href={pdfUrl}
                target="_blank"
                startIcon={<DownloadIcon />}
              >
                View Poll Attachment
              </Button>
            </Box>
          </object>
        ) : (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Button
              variant="outlined"
              href={pdfUrl}
              target="_blank"
              startIcon={<DownloadIcon />}
            >
              View Poll Attachment
            </Button>
          </Box>
        )}
      </Box>
    )
  }

  const getDisplayTitle = (pollId: string) => {
    const attachmentMatch = pollId.match(/(.+)_attachment_([A-Za-z0-9_-]{43})$/)
    let displayPoll = attachmentMatch ? attachmentMatch[1] : poll
    if (displayPoll.includes('_or_')){
      displayPoll = displayPoll.replace(/_/g, ' ') + '?' 
    }
    return displayPoll
  };

  return (
    <div className="content">
      <Helmet>
        <title>{getDisplayTitle(poll)} - ipvote.com</title>
        <meta name="description" content={`Vote on: ${getDisplayTitle(poll)}. See real-time results and geographic distribution of votes.`} />
        
        {/* Open Graph tags for social sharing */}
        <meta property="og:title" content={`${getDisplayTitle(poll)} - ipvote.com`} />
        <meta property="og:description" content={`Vote on: ${getDisplayTitle(poll)}. See real-time results and geographic distribution of votes.`} />
        <meta property="og:type" content="website" />
        
        {/* Schema.org structured data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VoteAction",
            "name": getDisplayTitle(poll),
            "description": `Vote on: ${getDisplayTitle(poll)}`,
            "result": Object.entries(results).map(([option, count]) => ({
              "@type": "VoteOption",
              "name": option,
              "voteCount": count
            }))
          })}
        </script>
      </Helmet>

      <h1 style={{ wordBreak: 'break-word' }}>
        {getDisplayTitle(poll)}
      </h1>
      
      {renderAttachment()}
      
      {poll === "Who should be world president?" && isOpenPoll && (
        <Box sx={{ mb: 2 }}>
          <Typography>
            Learn more about the{' '}
            <a href="/world_presidential_election.html" target="_blank" rel="noopener noreferrer">
              World President Election
            </a>
          </Typography>
          {/* {privacyAccepted && !phoneVerification?.phoneNumber && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Only votes with a verified phone number will be counted in the World President Election.
              {' '}<Link to="/ui/identity">Add phone number</Link>
            </Alert>
          )} */}
        </Box>
      )}

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

          {loading || dataLoading ? (
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
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includePhoneVerifiedOnly}
                            onChange={(e) => {
                              setIncludePhoneVerifiedOnly(e.target.checked);
                            }}
                          />
                        }
                        label="Verified phone numbers only"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includeRegisteredUsersOnly}
                            onChange={(e) => {
                              setIncludeRegisteredUsersOnly(e.target.checked);
                            }}
                          />
                        }
                        label="Registered users only (with vote delegation)"
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

              <Box sx={{ mt: 4, mb: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setShowAdvancedMaps(!showAdvancedMaps)}
                  sx={{ mb: 2 }}
                >
                  {showAdvancedMaps ? 'Hide' : 'Show'} IP block data
                </Button>
              </Box>
              
              {showAdvancedMaps && (
                <>
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
                </>
              )}
              
              <Box sx={{ mt: 2, mb: 4 }}>
                <Button
                  variant="outlined"
                  onClick={viewPollData}
                  startIcon={<SearchIcon />}
                >
                  View Poll Data
                </Button>
              </Box>

              <Box sx={{ mt: 4 }}>
                <PollMetadata 
                  poll={poll}
                  phoneVerification={phoneVerification}
                  isOpen={isOpenPoll}
                />
              </Box>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Poll 