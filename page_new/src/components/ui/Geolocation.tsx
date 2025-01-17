import React, { useState } from 'react'
import { Typography, Paper, Button, Box } from '@mui/material'

interface LatencyMessage {
  region: string
  latency: number
}

function Geolocation() {
  const [messages, setMessages] = useState<LatencyMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [nonce, setNonce] = useState<string | null>(null)

  const triggerTriangulationMeasurements = async () => {
    setIsLoading(true)
    setMessages([])
    
    try {
      // Warm up lambdas
      try {
        await Promise.all([
          fetch('https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/'),
          fetch('https://22kcgok5hkce3srzl4xksadj740npzoo.lambda-url.us-west-2.on.aws/'),
          fetch('https://wpbwaytwexqulyjlmly3rjkkdu0thgrr.lambda-url.eu-central-1.on.aws/'),
          fetch('https://hhhauh3i652elinvl7b37vh2ma0nrujk.lambda-url.ap-northeast-1.on.aws/'),
          fetch('https://rchgdkidnerk2gkfiynfgkveje0iujmm.lambda-url.ap-south-1.on.aws/'),
          fetch('https://5xaynesucez2tdtndxuyyqmjei0txpcw.lambda-url.eu-west-1.on.aws/'),
          fetch('https://unw3gvztdtl64g4zbzuyo6rozi0cvulu.lambda-url.sa-east-1.on.aws/'),
          fetch('https://bcjj76sx7xfqoz6yc6ngw6ioma0ajqsb.lambda-url.af-south-1.on.aws/'),
        ])
      } catch (_) {}

      setMessages(prev => [...prev, { region: 'System', latency: 0 }])

      // Start measurements
      const clientStartTimestamp = new Date().getTime()
      let clientReceivedNonceTimestamp: number

      // Get nonce
      const nonceResponse = await fetch(
        `https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/?clientStartTimestamp=${clientStartTimestamp}`
      )
      clientReceivedNonceTimestamp = new Date().getTime()
      const newNonce = await nonceResponse.text()
      setNonce(newNonce)
      setMessages(prev => [...prev, { 
        region: 'System', 
        latency: 0 
      }])

      // Measure latency to different regions
      const regions = [
        {
          url: 'https://wpbwaytwexqulyjlmly3rjkkdu0thgrr.lambda-url.eu-central-1.on.aws/',
          name: 'Germany'
        },
        {
          url: 'https://hhhauh3i652elinvl7b37vh2ma0nrujk.lambda-url.ap-northeast-1.on.aws/',
          name: 'Japan'
        },
        {
          url: 'https://unw3gvztdtl64g4zbzuyo6rozi0cvulu.lambda-url.sa-east-1.on.aws/',
          name: 'Brazil'
        },
        {
          url: 'https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/',
          name: 'US (Virginia)'
        },
        {
          url: 'https://22kcgok5hkce3srzl4xksadj740npzoo.lambda-url.us-west-2.on.aws/',
          name: 'US (Oregon)'
        },
        {
          url: 'https://rchgdkidnerk2gkfiynfgkveje0iujmm.lambda-url.ap-south-1.on.aws/',
          name: 'India'
        },
        {
          url: 'https://5xaynesucez2tdtndxuyyqmjei0txpcw.lambda-url.eu-west-1.on.aws/',
          name: 'Ireland'
        },
        {
          url: 'https://bcjj76sx7xfqoz6yc6ngw6ioma0ajqsb.lambda-url.af-south-1.on.aws/',
          name: 'South Africa'
        }
      ]

      await Promise.all(
        regions.map(async (region) => {
          const startTime = new Date().getTime()
          await fetch(`${region.url}?nonce=${newNonce}&clientReceivedNonceTimestamp=${clientReceivedNonceTimestamp}`)
          const latency = new Date().getTime() - startTime
          setMessages(prev => [...prev, { 
            region: region.name, 
            latency 
          }])
        })
      )

    } catch (error) {
      console.error('Triangulation error:', error)
      setMessages(prev => [...prev, { 
        region: 'Error', 
        latency: 0 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Geolocation via Network Latency
      </Typography>
      <Typography paragraph>
        Our system uses network latency measurements to multiple AWS regions around the world to approximate your location. 
        This helps verify vote authenticity without requiring precise location data.
      </Typography>
      <Typography paragraph>
        When you enable network triangulation:
      </Typography>
      <Typography component="ol" sx={{ pl: 3 }}>
        <li>Your browser measures response times to AWS servers in different regions</li>
        <li>These latency patterns help estimate your general geographic area</li>
        <li>No precise location or GPS data is collected</li>
        <li>The data helps validate that votes come from diverse locations</li>
      </Typography>

      <Box sx={{ my: 4 }}>
        <Button 
          variant="contained" 
          onClick={triggerTriangulationMeasurements}
          disabled={isLoading}
        >
          {isLoading ? 'Testing...' : 'Test Network Triangulation'}
        </Button>
      </Box>

      {messages.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Results:
          </Typography>
          {messages.map((msg, index) => (
            msg.region === 'System' ? (
              <Typography key={index} color="textSecondary">
                {index === 0 ? 'Initializing...' : `Nonce received: ${nonce?.substring(0, 10)}...`}
              </Typography>
            ) : msg.region === 'Error' ? (
              <Typography key={index} color="error">
                Network triangulation failed
              </Typography>
            ) : (
              <Typography key={index}>
                Latency to {msg.region}: {msg.latency}ms
              </Typography>
            )
          ))}
        </Box>
      )}
    </Paper>
  )
}

export default Geolocation
