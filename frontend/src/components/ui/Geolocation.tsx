import { useState, useEffect, useRef } from 'react'
import { Typography, Paper, Button, Box } from '@mui/material'
import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'
import Plot from 'react-plotly.js'
import 'mapbox-gl/dist/mapbox-gl.css'
import PrivacyAccept from './PrivacyAccept'

// Add type definition for the country data
interface CountryData {
  type: string
  features: {
    type: string
    geometry: {
      type: string
      coordinates: number[][][]
    }
    properties: {
      A3: string  // ISO 3166-1 alpha-3 country code
    }
  }[]
}

// Import and type the countries data
// @ts-ignore
import countriesData from '@geo-maps/countries-land-10km'
const countries = countriesData() as CountryData

// Replace with your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

interface LatencyMessage {
  region: string
  latency: number
  halfRoundTripLatency: number
  measurementIndex?: number
}

interface NonceResponse {
  nonce: string
  lambdaStartTimestamp: number
  nonceSentTime: number
}

interface LatencyResponse {
  lambdaStartTimestamp: number
  latencyResponseTimestamp: number
  nonce: string
}

interface DataCenter {
  name: string
  coordinates: [number, number] // [longitude, latitude]
  url: string
}

interface ClockOffset {
  region: string
  offset_master: number
  offset_slave: number
  measurementIndex?: number
}

const internetLatencyToDistance = (latency: number) => {
    const LIGHT_SECOND_km = 299792.458 
    const GLASS_FIBER_FACTOR = 0.66
    const ROUTING_FACTOR = 1.5
    const LAMBDA_STARTUP_ms = 10
    const distance_km = LIGHT_SECOND_km * (latency - LAMBDA_STARTUP_ms) / 1000 * GLASS_FIBER_FACTOR / ROUTING_FACTOR
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
]

const handleAntimeridian = (circle: GeoJSON.Feature) => {
  const coordinates = (circle.geometry as GeoJSON.Polygon).coordinates[0];
  
  // Check if circle crosses antimeridian
  let hasPointsEast = false;
  let hasPointsWest = false;
  let maxLongitudeDiff = 0;

  for (let i = 0; i < coordinates.length; i++) {
    const point = coordinates[i];
    const nextPoint = coordinates[i + 1] || coordinates[0];
    
    if (point[0] > 90) hasPointsEast = true;
    if (point[0] < -90) hasPointsWest = true;

    const longDiff = Math.abs(point[0] - nextPoint[0]);
    maxLongitudeDiff = Math.max(maxLongitudeDiff, longDiff);
  }

  // Return null for fill and indicate if circle crosses antimeridian
  return {
    circle,
    crossesAntimeridian: hasPointsEast && hasPointsWest && maxLongitudeDiff > 180
  };
};

interface GeolocationProps {
  privacyAccepted: boolean
  userIp: string | null
  onPrivacyAcceptChange: (accepted: boolean) => void
}

// Add color mapping for data centers
const dataCenterColors = {
  'Germany': '#FF6B6B',      // Red
  'Japan': '#4ECDC4',        // Teal
  'Brazil': '#45B7D1',       // Blue
  'US (Virginia)': '#96CEB4', // Green
  'US (Oregon)': '#88D8B0',  // Light Green
  'India': '#FFBE0B',        // Yellow
  'Ireland': '#FF006E',      // Pink
  'South Africa': '#8338EC'  // Purple
}

// Add this function to find intersecting countries
const findIntersectingCountries = (circle1: GeoJSON.Feature, circle2: GeoJSON.Feature) => {
  if (!countries || !countries.features) {
    console.error('Countries data not properly loaded:', countries);
    return [];
  }

  try {
    const intersectingCountries = new Set<string>();

    countries.features.forEach(country => {
      if (!country || !country.properties) return;

      // Convert country to proper GeoJSON feature
      const countryFeature = turf.feature(country.geometry, country.properties);

      // Check if country intersects with BOTH circles
      if (turf.booleanIntersects(circle1, countryFeature) && 
          turf.booleanIntersects(circle2, countryFeature)) {
        intersectingCountries.add(country.properties.A3 || '');
      }
    });

    return Array.from(intersectingCountries).sort();
  } catch (error) {
    console.error('Error finding intersecting countries:', error);
    return [];
  }
};

function Geolocation({ privacyAccepted, userIp, onPrivacyAcceptChange }: GeolocationProps) {
  const [messages, setMessages] = useState<LatencyMessage[]>([])
  const [clockOffsets, setClockOffsets] = useState<ClockOffset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [nonce, setNonce] = useState<string | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const circlesLayer = useRef<string[]>([])
  const [possibleCountries, setPossibleCountries] = useState<string[]>([])

  useEffect(() => {
    if (!mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [0, 20],
      zoom: 0.8,
      projection: 'globe',
      scrollZoom: false,
      dragRotate: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      boxZoom: false
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

    // Remove existing layers and sources
    circlesLayer.current.forEach(id => {
      if (map.current!.getLayer(`${id}-fill`)) {
        map.current!.removeLayer(`${id}-fill`)
      }
      if (map.current!.getSource(id)) {
        map.current!.removeSource(id)
      }
    })
    circlesLayer.current = []

    // Group messages by region and find minimum latency for each
    const minLatencyByRegion = messages.reduce((acc, msg) => {
      if (msg.region === 'System' || msg.region === 'Error') return acc
      if (!acc[msg.region] || msg.latency < acc[msg.region].latency) {
        acc[msg.region] = msg
      }
      return acc
    }, {} as Record<string, LatencyMessage>)

    // Get all circles sorted by radius
    const sortedCircles = Object.values(minLatencyByRegion)
      .map(msg => {
        const dataCenter = dataCenters.find(dc => dc.name === msg.region)
        if (!dataCenter) return null
        
        const radiusKm = internetLatencyToDistance(msg.latency)
        const center = turf.point(dataCenter.coordinates)
        const circle = turf.circle(center, radiusKm, {
          steps: 128,
          units: 'kilometers'
        })
        
        return {
          circle,
          radius: radiusKm,
          region: msg.region
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.radius - b.radius)

    // Get the two smallest circles that don't cross antimeridian
    const validCircles = sortedCircles
      .filter(c => !handleAntimeridian(c.circle).crossesAntimeridian)
      .slice(0, 2)

    // Try to get intersection
    if (validCircles.length === 2) {
      try {
        const circle1 = validCircles[0].circle;
        const circle2 = validCircles[1].circle;

        // Check if circles overlap
        if (turf.booleanOverlap(circle1, circle2)) {
          // Create unique IDs for the circles
          const circle1Id = 'circle-1';
          const circle2Id = 'circle-2';
          
          // Track the sources for cleanup
          circlesLayer.current.push(circle1Id, circle2Id);

          // Add circles as sources
          map.current!.addSource(circle1Id, {
            type: 'geojson',
            data: circle1
          });

          map.current!.addSource(circle2Id, {
            type: 'geojson',
            data: circle2
          });

          // Add fill layers
          map.current!.addLayer({
            id: `${circle1Id}-fill`,
            type: 'fill',
            source: circle1Id,
            paint: {
              'fill-color': '#007cbf',
              'fill-opacity': 0.2
            }
          });

          map.current!.addLayer({
            id: `${circle2Id}-fill`,
            type: 'fill',
            source: circle2Id,
            paint: {
              'fill-color': '#007cbf',
              'fill-opacity': 0.2
            }
          });

          // Find intersecting countries
          const countries = findIntersectingCountries(circle1, circle2);
          setPossibleCountries(countries);
        } else {
          console.log('Circles do not overlap');
          setPossibleCountries([]);
        }
      } catch (error) {
        console.error('Error computing overlap:', error);
        setPossibleCountries([]);
      }
    } else {
      setPossibleCountries([]);
    }
  }, [messages])

  const triggerTriangulationMeasurements = async () => {
    setIsLoading(true)
    setMessages([])
    setClockOffsets([])
    
    for (let measurementIndex = 0; measurementIndex < 3; measurementIndex++) {
      try {
        // Warm up lambdas
        try {
          await Promise.all(dataCenters.map((region) => fetch(region.url)))
        } catch (_) {}

        setMessages(prev => [...prev, { 
          region: 'System', 
          latency: 0, 
          halfRoundTripLatency: 0,
          measurementIndex 
        }])

        // Get new nonce for this round
        const clientStartTimestamp = new Date().getTime()
        let clientReceivedNonceTimestamp: number

        // Get nonce
        const nonceResponse = await fetch(
          `https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/?clientStartTimestamp=${clientStartTimestamp}`
        )
        clientReceivedNonceTimestamp = new Date().getTime()
        const nonceResponseData = (await nonceResponse.json()) as NonceResponse | undefined
        const roundNonce = nonceResponseData?.nonce

        setMessages(prev => [...prev, { 
          region: 'System', 
          latency: 0,
          halfRoundTripLatency: 0,
          measurementIndex
        }])

        await Promise.all(
          dataCenters.map(async (region) => {
            const clientSendNonceTime = new Date().getTime()
            const response = await fetch(`${region.url}?nonce=${roundNonce}&clientReceivedNonceTimestamp=${
              clientReceivedNonceTimestamp}`);
            const clientReceivedLatencyResponseTimestamp = new Date().getTime()
            const LatencyResponseData = await response.json() as LatencyResponse
            if (LatencyResponseData) {
              const t0 = clientStartTimestamp
              const t1 = nonceResponseData?.lambdaStartTimestamp || 0
              const t2 = nonceResponseData?.nonceSentTime || 0
              const t3 = clientReceivedNonceTimestamp

              const clockOffset_master = ((t1 - t0) + (t2 - t3)) / 2

              const t0_1 = clientSendNonceTime
              const t1_1 = LatencyResponseData.lambdaStartTimestamp
              const t2_1 = LatencyResponseData.latencyResponseTimestamp
              const t3_1 = clientReceivedLatencyResponseTimestamp

              const clockOffset_slave = ((t1_1 - t0_1) + (t2_1 - t3_1)) / 2

              setClockOffsets(prev => [...prev, {
                region: region.name,
                offset_master: clockOffset_master,
                offset_slave: clockOffset_slave,
                measurementIndex
              }])

              const latency = (LatencyResponseData.lambdaStartTimestamp - clockOffset_slave) - clientSendNonceTime
              const halfRoundTripLatency = (clientReceivedLatencyResponseTimestamp - clientSendNonceTime - 1000) / 2

              setMessages(prev => [...prev, { 
                region: region.name, 
                latency,
                halfRoundTripLatency,
                measurementIndex
              }])
            }
          })
        )

      } catch (error) {
        console.error('Triangulation error:', error)
        setMessages(prev => [...prev, { 
          region: 'Error', 
          latency: 0,
          halfRoundTripLatency: 0,
          measurementIndex
        }])
      }
    }
    setIsLoading(false)
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Geolocation via Network Latency <span style={{ fontSize: '20px', color: '#cc8888' }}>(Beta)</span>
      </Typography>
      <Typography paragraph>
        This allows us to estimate your location to validate where the hardware that is attached to your IP address is located. Read more <a href="/geolocation_via_latency.html">here</a>
      </Typography>

      <PrivacyAccept
        userIp={userIp}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        textAlign="center"
      />

      <Box sx={{ my: 4, mb: 6 }}>
        <Button 
          variant="contained" 
          onClick={triggerTriangulationMeasurements}
          disabled={isLoading || !privacyAccepted}
        >
          {isLoading ? 'Testing...' : 'Test Network Triangulation'}
        </Button>
      </Box>
      
      <Box sx={{ my: 4, height: 400 }} ref={mapContainer} />

      {clockOffsets.length > 0 && messages.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Latency vs Clock Offset:
          </Typography>
          <Box sx={{ height: 300 }}>
            <Plot
              data={dataCenters.map(dc => ({
                name: dc.name,
                type: 'scatter',
                mode: 'markers+text',
                x: clockOffsets
                  .filter(offset => offset.region === dc.name)
                  .map(offset => offset.offset_slave),
                y: messages
                  .filter(msg => msg.region === dc.name)
                  .map(msg => msg.latency),
                text: clockOffsets
                  .filter(offset => offset.region === dc.name)
                  .map(offset => `#${offset.measurementIndex! + 1}`),
                textposition: 'top center',
                marker: {
                  color: dataCenterColors[dc.name as keyof typeof dataCenterColors],
                  size: 8
                }
              }))}
              layout={{
                margin: { t: 30, r: 120, l: 50, b: 50 },
                height: 300,
                xaxis: {
                  title: 'Clock Offset (ms)',
                  zeroline: true
                },
                yaxis: {
                  title: 'Latency (ms)',
                  zeroline: true
                },
                hovermode: 'closest',
                showlegend: true,
                legend: {
                  x: 1.05,
                  xanchor: 'left',
                  y: 1,
                  yanchor: 'top'
                }
              }}
              config={{
                displayModeBar: false,
                responsive: true
              }}
              style={{ width: '100%' }}
            />
          </Box>
        </Box>
      )}

      {messages.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Results:
          </Typography>
          {Array.from(new Set(messages.map(msg => msg.measurementIndex)))
            .filter(index => index !== undefined)
            .map((measurementIndex) => (
              <Typography key={measurementIndex} color="textSecondary">
                Measurement round #{(measurementIndex as number) + 1} completed
              </Typography>
          ))}
        </Box>
      )}

      {possibleCountries.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Possible Countries:
          </Typography>
          <Typography color="textSecondary">
            Based on the intersection of the two smallest circles, you are assumed to be in one of the following countries: {' '}
            {possibleCountries.join(', ')}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

export default Geolocation
