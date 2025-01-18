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
time,masked_ip,poll,vote,country,nonce,country_geoip,asn_name_geoip
1730688934736,5.45.104.XXX,harris_or_trump,trump,,,DE,netcup GmbH
1730689251360,2.58.56.XXX,harris_or_trump,trump,,,NL,1337 Services GmbH
1730690649238,5.255.99.XXX,harris_or_trump,trump,,,NL,The Infrastructure Group B.V.
*/

function Poll({ privacyAccepted, userIp, onPrivacyAcceptChange }: PollProps) {
  const location = useLocation()
  const [poll, setPoll] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ [key: string]: number }>({})
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [includeTor, setIncludeTor] = useState(true)
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [votesByCountry, setVotesByCountry] = useState<{ [key: string]: { [option: string]: number } }>({})

  useEffect(() => {
    // Get poll ID from URL path or hash
    const pollFromPath = decodeURIComponent(location.pathname.split('/')[1])
    const pollFromHash = location.hash ? decodeURIComponent(location.hash.substring(1)) : ''
    const currentPoll = pollFromHash || pollFromPath

    if (currentPoll) {
      setPoll(currentPoll)
      fetchResults(currentPoll)
    }
  }, [location])

  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterAnchorEl(event.currentTarget)
  }

  const handleFilterClose = () => {
    setFilterAnchorEl(null)
  }

  const filterOpen = Boolean(filterAnchorEl)

  console.log(votesByCountry)

  const fetchResults = async (pollId: string) => {
    try {
      const response = await fetch(`https://qcnwhqz64hoatxs4ttdxpml7ze0mxrvg.lambda-url.us-east-1.on.aws/?poll=${pollId}&excludeTor=${!includeTor}`)
      if (response.status === 200) {
        const text = await response.text()
        const votes = text.split('\n').filter(line => line.trim())
        
        // Process current totals
        if (pollId.includes('_or_')) {
          const options = pollId.split('_or_')
          const option1Votes = votes.filter(vote => vote.split(',')[3] === options[0]).length
          const option2Votes = votes.filter(vote => vote.split(',')[3] === options[1]).length
          setResults({ [options[0]]: option1Votes, [options[1]]: option2Votes })
        } else {
          const yesVotes = votes.filter(vote => vote.split(',')[3] === 'yes').length
          const noVotes = votes.filter(vote => vote.split(',')[3] === 'no').length
          setResults({ yes: yesVotes, no: noVotes })
        }

        // Process votes by country
        const countryVotes: { [key: string]: { [option: string]: number } } = {};
        votes.forEach(vote => {
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
        
        votes.forEach(vote => {
          try {
            const [timestamp, , , option] = vote.split(',')
            // Convert milliseconds to seconds if needed
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

        // Convert to array and sort by date
        const history = Object.entries(dailyVotes).map(([date, votes]) => ({
          date,
          votes
        })).sort((a, b) => a.date.localeCompare(b.date))

        setVoteHistory(history)
      }
    } catch (error) {
      console.error('Error fetching results:', error)
    }
  }

  useEffect(() => {
    fetchResults(poll)
  }, [includeTor])

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
    window.open(`https://krzzi6af5wivgfdvtdhllb4ycm0zgjde.lambda-url.us-east-1.on.aws/?poll=${poll}`, '_blank');
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
                              fetchResults(poll);
                            }}
                          />
                        }
                        label="Include votes from Tor exit nodes"
                      />
                      {/* Additional filters can be added here in the future */}
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