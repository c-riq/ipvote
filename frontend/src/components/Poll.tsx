import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
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
  Tooltip
} from '@mui/material'
import Plot from 'react-plotly.js'
import DownloadIcon from '@mui/icons-material/Download'
import FilterListIcon from '@mui/icons-material/FilterList'
import PrivacyAccept from './ui/PrivacyAccept'
import VoteMap from './VoteMap'
import IPBlockMap from './IPBlockMap'
import IPv6BlockMap from './IPv6BlockMap'

interface VoteHistory {
  date: string;
  votes: { [key: string]: number };
}

interface PollProps {
  privacyAccepted: boolean
  userIp: string | null
  onPrivacyAcceptChange: (accepted: boolean) => void
}
/* voting data schema:
time,masked_ip,poll,vote,country,nonce,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider
1730623803558,12.158.241.XXX,harris_or_trump,trump,,,TW,HostingInside LTD.,0,1,
1730763791706,52.194.133.XXX,harris_or_trump,harris,,,US,Amazon.com%2C Inc.,0,1,aws:us-east-1
1731672863490,62.126.89.XXX,harris_or_trump,trump,,,BG,Vivacom Bulgaria EAD,0,0,
*/

function Poll({ privacyAccepted, userIp, onPrivacyAcceptChange }: PollProps) {
  const location = useLocation()
  const [poll, setPoll] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ [key: string]: number }>({})
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [includeTor, setIncludeTor] = useState(true)
  const [includeVpn, setIncludeVpn] = useState(true)
  const [includeCloud, setIncludeCloud] = useState(true)
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [votesByCountry, setVotesByCountry] = useState<{ [key: string]: { [option: string]: number } }>({})
  const [votes, setVotes] = useState<string[]>([])
  const [allVotes, setAllVotes] = useState<string[]>([])

  useEffect(() => {
    // Get poll ID from URL path only
    const pollFromPath = decodeURIComponent(location.pathname.split('/')[1])

    if (pollFromPath) {
      setPoll(pollFromPath)
      fetchResults(pollFromPath)
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

  const fetchResults = async (pollId: string, refresh: boolean = true) => {
    try {
      const response = await fetch(`https://qcnwhqz64hoatxs4ttdxpml7ze0mxrvg.lambda-url.us-east-1.on.aws/?poll=${pollId}&refresh=${refresh}`)
      if (response.status === 200) {
        const text = await response.text()
        const allVoteData = text.split('\n').filter(line => line.trim())
        setAllVotes(allVoteData)
        
        processVotes(allVoteData)
      }
    } catch (error) {
      console.error('Error fetching results:', error)
    }
  }

  const processVotes = (voteData: string[]) => {
    // Filter votes based on user preferences
    const filteredVotes = voteData.filter(vote => {
      const [,,,,,,,,is_tor,is_vpn,is_cloud_provider] = vote.split(',')
      return (includeTor || is_tor !== '1') && 
             (includeVpn || is_vpn !== '1') && 
             (includeCloud || is_cloud_provider.trim() === '')
    })

    // Process current totals
    if (poll.includes('_or_')) {
      const options = poll.split('_or_')
      const option1Votes = filteredVotes.filter(vote => vote.split(',')[3] === options[0]).length
      const option2Votes = filteredVotes.filter(vote => vote.split(',')[3] === options[1]).length
      setResults({ [options[0]]: option1Votes, [options[1]]: option2Votes })
    } else {
      const yesVotes = filteredVotes.filter(vote => vote.split(',')[3] === 'yes').length
      const noVotes = filteredVotes.filter(vote => vote.split(',')[3] === 'no').length
      setResults({ yes: yesVotes, no: noVotes })
    }

    // Process votes by country
    const countryVotes: { [key: string]: { [option: string]: number } } = {};
    filteredVotes.forEach(vote => {
      const [, , , option, , , country] = vote.split(',');
      if (country && country !== 'XX') {
        if (!countryVotes[country]) {
          countryVotes[country] = {};
        }
        countryVotes[country][option] = (countryVotes[country][option] || 0) + 1;
      }
    });
    setVotesByCountry(countryVotes);

    // Process historical data
    const dailyVotes: { [key: string]: { [key: string]: number } } = {}
    
    filteredVotes.forEach(vote => {
      try {
        const [timestamp, , , option] = vote.split(',')
        const ts = timestamp.length === 13 ? parseInt(timestamp) : parseInt(timestamp) * 1000
        const date = new Date(ts).toISOString().split('T')[0]
        
        if (!dailyVotes[date]) {
          dailyVotes[date] = {}
        }
        dailyVotes[date][option] = (dailyVotes[date][option] || 0) + 1
      } catch (error) {
        console.warn('Invalid timestamp in vote:', vote)
      }
    })

    const history = Object.entries(dailyVotes).map(([date, votes]) => ({
      date,
      votes
    })).sort((a, b) => a.date.localeCompare(b.date))

    setVoteHistory(history)
    setVotes(filteredVotes)
  }

  const vote = async (option: string) => {
    setLoading(true)
    try {
      const response = await fetch(`https://a47riucyg3q3jjnn5gic56gtcq0upfxg.lambda-url.us-east-1.on.aws/?poll=${poll}&vote=${option}`)
      const data = await response.text()
      if (response.status === 200) {
        setMessage('Vote submitted successfully!')
      } else {
        setMessage(JSON.parse(data)?.message || data)
      }
      fetchResults(poll)
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
            title="Please accept the privacy policy first"
            arrow
            disableHoverListener={privacyAccepted}
            disableFocusListener={privacyAccepted}
            disableTouchListener={privacyAccepted}
            placement="top"
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <div style={{ display: 'inline-block' }}>
              <Button
                variant="contained"
                disabled={!privacyAccepted}
                onClick={() => vote(option)}
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

    const options = poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']
    const traces = options.map(option => ({
      x: voteHistory.map(day => day.date),
      y: voteHistory.map(day => day.votes[option] || 0),
      name: option,
      type: 'scatter' as const,
      mode: 'lines' as const,
    }))

    return (
      <Box sx={{ mt: 4, height: '300px' }}>
        <Plot
          data={traces}
          layout={{
            title: 'Votes over time',
            autosize: true,
            margin: { t: 30, r: 10, b: 30, l: 40 },
            xaxis: {
              title: 'Date',
              showgrid: false,
            },
            yaxis: {
              title: 'Votes',
              showgrid: true,
            },
            showlegend: true,
            legend: {
              x: 0,
              y: 1,
              orientation: 'h'
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </Box>
    )
  }

  const renderVoteButtons = () => {
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
          title="Please accept the privacy policy first"
          arrow
          disableHoverListener={privacyAccepted}
          disableFocusListener={privacyAccepted}
          disableTouchListener={privacyAccepted}
          placement="top"
          enterTouchDelay={0}
          leaveTouchDelay={5000}
        >
          <div style={{ display: 'inline-block' }}>
            <Button
              variant="contained"
              disabled={!privacyAccepted}
              onClick={() => vote(option)}
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
    window.open(`https://krzzi6af5wivgfdvtdhllb4ycm0zgjde.lambda-url.us-east-1.on.aws/?poll=${poll}&refresh=true`, '_blank');
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
        </Alert>
      )}
      
      {!userIp ? (
        <CircularProgress />
      ) : (
        <>
          <PrivacyAccept
            userIp={userIp}
            accepted={privacyAccepted}
            onAcceptChange={onPrivacyAcceptChange}
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
                options={poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']} 
              />
              
              <IPBlockMap
                votes={votes}
                options={poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']}
              />
              
              <IPv6BlockMap
                votes={votes}
                options={poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']}
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