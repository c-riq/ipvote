import Plot from 'react-plotly.js'
import { Box, Typography } from '@mui/material'

interface ASNData {
  name: string
  value: number
  option: string
}

interface ASNTreemapProps {
  asnData: ASNData[]
  options: string[]
}

function ASNTreemap({ asnData, options }: ASNTreemapProps) {
  if (asnData.length === 0) return null

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

    if (options.length === 2) {
      // Binary choice logic
      const option1Votes = votes[options[0]] || 0
      const ratio = option1Votes / total
      
      if (ratio === 0.5) {
        return 'rgba(128, 0, 128, 0.7)' // Tie: light purple
      }

      const red = Math.round(255 * (1 - ratio))
      const blue = Math.round(255 * ratio)
      return `rgba(${red}, 0, ${blue}, 0.7)`
    } else {
      // Multiple options logic
      const winner = Object.entries(votes).reduce((max, [option, count]) => 
        count > (votes[max] || 0) ? option : max
      , Object.keys(votes)[0])

      // Generate consistent color based on winning option
      const hash = [...winner].reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc)
      }, 0)
      
      const h = Math.abs(hash % 360) // Hue between 0 and 360
      return `hsla(${h}, 70%, 50%, 0.7)`
    }
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
    
    const winner = Object.entries(votes).reduce((max, [option, count]) => 
      count > (votes[max] || 0) ? option : max
    , Object.keys(votes)[0])
    
    if (winner) {
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
            gridTemplateColumns: { xs: '1fr', sm: options.length === 2 ? 'repeat(2, auto)' : 'repeat(auto-fill, minmax(150px, 1fr))' },
            gap: 2
          }}>
            {options.map((option, i) => {
              // Generate consistent color for each option
              const hash = options.length === 2 ? 0 : [...option].reduce((acc, char) => {
                return char.charCodeAt(0) + ((acc << 5) - acc)
              }, 0)
              const h = Math.abs(hash % 360)
              
              return (
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
                    bgcolor: options.length === 2 
                      ? (i === 0 ? 'rgb(0, 0, 255)' : 'rgb(255, 0, 0)')
                      : `hsl(${h}, 70%, 50%)`,
                    borderRadius: '50%'
                  }} />
                  <Typography noWrap>
                    {option}: {asnMajorityVotes[option] || 0}
                    {' '}
                    ({totalAsnVotes ? ((asnMajorityVotes[option] || 0) / totalAsnVotes * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
              )
            })}
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

export default ASNTreemap 