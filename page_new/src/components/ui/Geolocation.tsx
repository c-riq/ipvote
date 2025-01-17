import React, { useState, useEffect, useRef } from 'react'
import { Typography, Paper, Button, Box } from '@mui/material'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Replace with your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

interface LatencyMessage {
  region: string
  latency: number
}

interface NonceResponse {
  nonce: string
  lambdaStartTimestamp: number
  nonceSentTime: number
}

interface LatencyResponse {
  lambdaStartTimestamp: number
  nonce: string
}

interface DataCenter {
  name: string
  coordinates: [number, number] // [longitude, latitude]
  url: string
}

const internetLatencyToDistance = (latency: number) => {
    const LIGHT_SECOND_km = 299792.458 
    const GLASS_FIBER_FACTOR = 0.66
    const ROUTING_FACTOR = 1.5
    const LAMBDA_STARTUP_ms = 10
    const distance_km = LIGHT_SECOND_km * (latency - LAMBDA_STARTUP_ms) * GLASS_FIBER_FACTOR * ROUTING_FACTOR
    return distance_km
}

const dataCenters: DataCenter[] = [
  {
    name: 'Germany',
    coordinates: [8.6821, 50.1109], // Frankfurt
    url: 'https://wpbwaytwexqulyjlmly3rjkkdu0thgrr.lambda-url.eu-central-1.on.aws/'
  },
  {
    name: 'Japan',
    coordinates: [139.7594, 35.6850], // Tokyo
    url: 'https://hhhauh3i652elinvl7b37vh2ma0nrujk.lambda-url.ap-northeast-1.on.aws/'
  },
  {
    name: 'Brazil',
    coordinates: [-46.6333, -23.5505], // São Paulo
    url: 'https://unw3gvztdtl64g4zbzuyo6rozi0cvulu.lambda-url.sa-east-1.on.aws/'
  },
  {
    name: 'US (Virginia)',
    coordinates: [-77.0469, 38.8048], // N. Virginia
    url: 'https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/'
  },
  {
    name: 'US (Oregon)',
    coordinates: [-122.6765, 45.5231], // Oregon
    url: 'https://22kcgok5hkce3srzl4xksadj740npzoo.lambda-url.us-west-2.on.aws/'
  },
  {
    name: 'India',
    coordinates: [72.8777, 19.0760], // Mumbai
    url: 'https://rchgdkidnerk2gkfiynfgkveje0iujmm.lambda-url.ap-south-1.on.aws/'
  },
  {
    name: 'Ireland',
    coordinates: [-6.2603, 53.3498], // Dublin
    url: 'https://5xaynesucez2tdtndxuyyqmjei0txpcw.lambda-url.eu-west-1.on.aws/'
  },
  {
    name: 'South Africa',
    coordinates: [18.4241, -33.9249], // Cape Town
    url: 'https://bcjj76sx7xfqoz6yc6ngw6ioma0ajqsb.lambda-url.af-south-1.on.aws/'
  }
].splice(0, 2)

function Geolocation() {
  const [messages, setMessages] = useState<LatencyMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [nonce, setNonce] = useState<string | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const circlesLayer = useRef<string[]>([])

  useEffect(() => {
    if (!mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [0, 20], // Center the map
      zoom: 1.5
    })

    // Add markers for data centers
    dataCenters.forEach(dc => {
      new mapboxgl.Marker()
        .setLngLat(dc.coordinates)
        .setPopup(new mapboxgl.Popup().setHTML(dc.name))
        .addTo(map.current!)
    })

    return () => {
      map.current?.remove()
    }
  }, [])

  // Update circles on the map when latency measurements change
  useEffect(() => {
    if (!map.current) return

    // Remove existing circles
    circlesLayer.current.forEach(id => {
      const layer = map.current!.getLayer(id)
      if (layer) {
        map.current!.removeLayer(id)
        map.current!.removeSource(id)
      }
    })
    circlesLayer.current = []

    // Add new circles based on latency measurements
    messages.forEach(msg => {
      const dataCenter = dataCenters.find(dc => dc.name === msg.region)
      if (!dataCenter || msg.region === 'System' || msg.region === 'Error') return

      // Convert latency to approximate kilometers (rough estimation)
      const radiusKm = internetLatencyToDistance(msg.latency) / 1000
      
      const circleId = `circle-${msg.region}`
      circlesLayer.current.push(circleId)

      // Create a circle around the data center
      const center = dataCenter.coordinates
      const points = 64
      const km = radiusKm
      const features = []
      
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * 2 * Math.PI
        const lat = center[1] + (km / 111.32) * Math.cos(angle)
        const lon = center[0] + (km / (111.32 * Math.cos(center[1] * (Math.PI / 180)))) * Math.sin(angle)
        features.push([lon, lat])
      }
      features.push(features[0]) // Close the circle

      map.current!.addSource(circleId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: features
          }
        }
      })

      map.current!.addLayer({
        id: circleId,
        type: 'line',
        source: circleId,
        paint: {
          'line-color': '#007cbf',
          'line-width': 2,
          'line-opacity': 0.5
        }
      })
    })
  }, [messages])

  const triggerTriangulationMeasurements = async () => {
    setIsLoading(true)
    setMessages([])
    
    try {
      // Warm up lambdas
      try {
        await Promise.all([
            dataCenters.map((region) => fetch(region.url))
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
      const nonceResponseData = (await nonceResponse.json()) as NonceResponse | undefined
      if (nonceResponseData) {
        setNonce(nonceResponseData.nonce)
      }
      setMessages(prev => [...prev, { 
        region: 'System', 
        latency: 0 
      }])


      await Promise.all(
        dataCenters.map(async (region) => {
          const clientSendNonceTime = new Date().getTime()
          const response = await fetch(`${region.url}?nonce=${nonceResponseData?.nonce}&clientReceivedNonceTimestamp=${
            clientReceivedNonceTimestamp}`)
          const LatencyResponseData = await response.json() as LatencyResponse
          if (LatencyResponseData) {
            // NTP algorithm for clock offset and latency calculation
            const t0 = clientStartTimestamp
            const t1 = nonceResponseData?.lambdaStartTimestamp || 0
            const t2 = nonceResponseData?.nonceSentTime || 0
            const t3 = clientReceivedNonceTimestamp

            // Clock offset = ((t1 - t0) + (t2 - t3)) / 2
            const clockOffset = ((t1 - t0) + (t2 - t3)) / 2

            const latency = (LatencyResponseData.lambdaStartTimestamp - clockOffset) - clientSendNonceTime

            setMessages(prev => [...prev, { 
              region: region.name, 
              latency 
            }])
          }
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

      <Box sx={{ my: 4, height: 400 }} ref={mapContainer} />

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
