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
  Tooltip
} from '@mui/material'
import Plot from 'react-plotly.js'
import DownloadIcon from '@mui/icons-material/Download'
import FilterListIcon from '@mui/icons-material/FilterList'
import PrivacyAccept from './ui/PrivacyAccept'
import VoteMap from './VoteMap'
import IPBlockMap from './IPBlockMap'
import IPv6BlockMap from './IPv6BlockMap'
import { IpInfoResponse } from '../App'

interface VoteHistory {
  date: string;
  votes: { [key: string]: number };
}

interface ASNData {
  name: string
  value: number
  option: string
}

interface PollProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
  onPrivacyAcceptChange: (accepted: boolean, captchaToken?: string) => void
}
/* voting data schema:
time,masked_ip,poll,vote,country,nonce,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider
1730623803558,12.158.241.XXX,harris_or_trump,trump,,,TW,HostingInside LTD.,0,1,
1730763791706,52.194.133.XXX,harris_or_trump,harris,,,US,Amazon.com%2C Inc.,0,1,aws:us-east-1
1731672863490,62.126.89.XXX,harris_or_trump,trump,,,BG,Vivacom Bulgaria EAD,0,0,
*/

function Poll({ privacyAccepted, userIpInfo, captchaToken, setCaptchaToken, onPrivacyAcceptChange }: PollProps) {
  const navigate = useNavigate()
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
  const [asnData, setAsnData] = useState<ASNData[]>([])
  const [chartZoomEnabled, setChartZoomEnabled] = useState(false);

  useEffect(() => {
    // Get poll ID from URL path only
    const pollFromPath = decodeURIComponent(location.pathname.split('/')[1])
    if (pollFromPath.includes('.')) {
      // navigate to home
      navigate('/')
    }

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
    // Skip header row by starting from index 1
    const filteredVotes = voteData.slice(1).filter(vote => {
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

    // Process ASN data
    const asnVotes: { [key: string]: { [option: string]: number } } = {}
    filteredVotes.forEach(vote => {
      const [, , , option, , , , asn_name] = vote.split(',')
      if (asn_name && asn_name !== '') {
        const decodedName = decodeURIComponent(asn_name)
        if (!asnVotes[decodedName]) {
          asnVotes[decodedName] = {}
        }
        asnVotes[decodedName][option] = (asnVotes[decodedName][option] || 0) + 1
      }
    })

    // Convert to array format for treemap
    const asnArray: ASNData[] = []
    Object.entries(asnVotes).forEach(([name, votes]) => {
      Object.entries(votes).forEach(([option, count]) => {
        asnArray.push({ name, value: count, option })
      })
    })
    setAsnData(asnArray)
  }

  const handleVote = async (vote: string) => {
    setLoading(true)
    try { 
      const response = await fetch(`https://a47riucyg3q3jjnn5gic56gtcq0upfxg.lambda-url.us-east-1.on.aws/?poll=${poll}&vote=${vote}&captchaToken=${captchaToken}`)
      const data = await response.text()
      if (response.status === 200) {
        setMessage('Vote submitted successfully!')
      } else {
        setMessage(JSON.parse(data)?.message || data)
        if (data.includes('captcha')) {
          setCaptchaToken('')
        }
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
            title={!privacyAccepted ? "Please accept the privacy policy first" : 
                  !captchaToken ? "Please complete the captcha verification" : ""}
            arrow
            disableHoverListener={privacyAccepted && !!captchaToken}
            disableFocusListener={privacyAccepted && !!captchaToken}
            disableTouchListener={privacyAccepted && !!captchaToken}
            placement="top"
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <div style={{ display: 'inline-block' }}>
              <Button
                variant="contained"
                disabled={!privacyAccepted || !captchaToken}
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

    const options = poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']
    const traces = options.map((option, i) => ({
      x: voteHistory.map(day => day.date),
      y: voteHistory.map(day => day.votes[option] || 0),
      name: option,
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: {
        color: i === 0 ? '#4169E1' : '#ff6969'
      }
    }))

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
              hovermode: false
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
                !captchaToken ? "Please complete the captcha verification" : ""}
          arrow
          disableHoverListener={privacyAccepted && !!captchaToken}
          disableFocusListener={privacyAccepted && !!captchaToken}
          disableTouchListener={privacyAccepted && !!captchaToken}
          placement="top"
          enterTouchDelay={0}
          leaveTouchDelay={5000}
        >
          <div style={{ display: 'inline-block' }}>
            <Button
              variant="contained"
              disabled={!privacyAccepted || !captchaToken}
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
    window.open(`https://krzzi6af5wivgfdvtdhllb4ycm0zgjde.lambda-url.us-east-1.on.aws/?poll=${poll}&refresh=true`, '_blank');
  };

  const renderASNTreemap = () => {
    if (asnData.length === 0) return null

    const options = poll.includes('_or_') ? poll.split('_or_') : ['yes', 'no']

    // Calculate ASN-level votes
    const asnVotes: { [key: string]: { [key: string]: number } } = {}
    asnData.forEach(d => {
      if (!asnVotes[d.name]) {
        asnVotes[d.name] = {}
      }
      asnVotes[d.name][d.option] = (asnVotes[d.name][d.option] || 0) + d.value
    })

    // Calculate colors based on vote ratios
    const getColor = (name: string) => {
      const votes = asnVotes[name]
      const total = Object.values(votes).reduce((a, b) => a + b, 0)
      
      if (total === 0) {
        return 'rgba(128, 128, 128, 0.7)' // No votes
      }

      const option1Votes = votes[options[0]] || 0
      const ratio = option1Votes / total
      
      if (ratio === 0.5) {
        return 'rgba(128, 0, 128, 0.7)' // Tie: light purple
      }

      // Interpolate between red (255,0,0) and blue (0,0,255)
      // ratio = 0 -> pure red
      // ratio = 1 -> pure blue
      const red = Math.round(255 * (1 - ratio))
      const blue = Math.round(255 * ratio)
      return `rgba(${red}, 0, ${blue}, 0.7)`
    }

    // Create hover text with vote breakdown
    const getHoverText = (name: string) => {
      const votes = asnVotes[name]
      const total = Object.values(votes).reduce((a, b) => a + b, 0)
      const breakdown = options.map(option => 
        `${option}: ${votes[option] || 0} (${((votes[option] || 0) / total * 100).toFixed(1)}%)`
      ).join('<br>')
      return `<b>${name}</b><br>${breakdown}<br>Total: ${total}`
    }

    // Group data by ASN name to get unique entries
    const uniqueAsns = Array.from(new Set(asnData.map(d => d.name)))

    // Calculate majority vote for each ASN
    const asnMajorityVotes = Object.entries(asnVotes).reduce((acc, [_, votes]) => {
      const total = Object.values(votes).reduce((a, b) => a + b, 0)
      if (total === 0) return acc
      
      const option1Votes = votes[options[0]] || 0
      const ratio = option1Votes / total
      
      // Only count non-ties
      if (ratio !== 0.5) {
        const winner = ratio > 0.5 ? options[0] : options[1]
        acc[winner] = (acc[winner] || 0) + 1
      }
      return acc
    }, {} as { [key: string]: number })

    const totalAsnVotes = Object.values(asnMajorityVotes).reduce((a, b) => a + b, 0)

    return (
      <>
        <Box sx={{ mt: 4, height: '500px' }}>
          <Plot
            data={[{
              type: 'treemap',
              labels: uniqueAsns.map(name => name),
              parents: uniqueAsns.map(() => ''),
              values: uniqueAsns.map(name => Object.values(asnVotes[name]).reduce((a, b) => a + b, 0)),
              marker: {
                colors: uniqueAsns.map(name => getColor(name))
              },
              textinfo: 'label',
              hovertemplate: '%{customdata}<extra></extra>',
              customdata: uniqueAsns.map(name => getHoverText(name)),
              hoverlabel: {
                bgcolor: 'white',
                bordercolor: '#ddd',
                font: { color: 'black' }
              }
            }]}
            layout={{
              title: 'Votes by Network Provider (ASN)',
              autosize: true,
              margin: { t: 30, r: 10, b: 10, l: 10 },
              paper_bgcolor: 'transparent',
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </Box>
        
        <Box sx={{ 
          mt: 2, 
          p: 2, 
          bgcolor: 'background.paper',
          borderRadius: 1,
          boxShadow: 1
        }}>
          <Typography variant="h6" gutterBottom>
            ASN-level Vote Results
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each network provider (ASN) gets one vote based on the majority preference of its users.
          </Typography>
          
          <Box sx={{ 
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            justifyContent: { sm: 'space-between' },
            gap: { xs: 1, sm: 2 }
          }}>
            <Box sx={{ 
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, auto)' },
              gap: 2
            }}>
              {options.map((option, i) => (
                <Box key={option} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  minWidth: 0
                }}>
                  <Box sx={{ 
                    width: 12, 
                    height: 12, 
                    flexShrink: 0,
                    bgcolor: i === 0 ? 'rgb(0, 0, 255)' : 'rgb(255, 0, 0)',
                    borderRadius: '50%'
                  }} />
                  <Typography noWrap>
                    {option}: {asnMajorityVotes[option] || 0}
                    {' '}
                    ({totalAsnVotes ? ((asnMajorityVotes[option] || 0) / totalAsnVotes * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
              ))}
            </Box>
            
            <Typography 
              color="text.secondary"
              sx={{ 
                borderLeft: { sm: 1 },
                borderColor: { sm: 'divider' },
                pl: { sm: 2 }
              }}
            >
              Total ASNs: {totalAsnVotes}
            </Typography>
          </Box>
        </Box>
      </>
    )
  }

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
              
              {renderASNTreemap()}
              
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