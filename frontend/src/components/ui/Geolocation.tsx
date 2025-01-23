import { useState, useEffect, useRef } from 'react'
import { Typography, Paper, Button, Box, LinearProgress, Checkbox, FormControlLabel } from '@mui/material'
import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'
import Plot from 'react-plotly.js'
import 'mapbox-gl/dist/mapbox-gl.css'
import PrivacyAccept from './PrivacyAccept'
import { Data } from 'plotly.js'

// Add type for the country geometry
interface CountryGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][];
}

// Update CountryData interface
interface CountryData {
  type: string;
  features: {
    type: string;
    geometry: CountryGeometry;
    properties: {
      A3: string;  // ISO 3166-1 alpha-3 country code
    };
  }[];
}

// Import and type the countries data
// @ts-ignore
import countriesData from '@geo-maps/countries-land-10km'
import { IpInfoResponse } from '../../App'
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
  name_long: string
  coordinates: [number, number] // [longitude, latitude]
  url: string
  color: string
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
    const ROUTING_FACTOR_small_distances = 1.8
    const ROUTING_FACTOR_large_distances = 1.3 // TODO: refine based on data
    const routingFactor = latency < 40 ? ROUTING_FACTOR_small_distances : ROUTING_FACTOR_large_distances
    const LAMBDA_STARTUP_ms = 10
    const distance_km = LIGHT_SECOND_km * (latency - LAMBDA_STARTUP_ms) / 1000 * GLASS_FIBER_FACTOR / routingFactor
    return distance_km
}

const dataCenters: DataCenter[] = [
  {
    name: 'Germany',
    name_long: 'eu-central-1',
    coordinates: [8.6821, 50.1109], // Frankfurt
    url: 'https://wpbwaytwexqulyjlmly3rjkkdu0thgrr.lambda-url.eu-central-1.on.aws/',
    color: '#FF6B6B'
  },
  {
    name: 'Japan',
    name_long: 'ap-northeast-1',
    coordinates: [139.7594, 35.6850], // Tokyo
    url: 'https://hhhauh3i652elinvl7b37vh2ma0nrujk.lambda-url.ap-northeast-1.on.aws/',
    color: '#FF006E'
  },
  {
    name: 'Brazil',
    name_long: 'sa-east-1',
    coordinates: [-46.6333, -23.5505], // São Paulo
    url: 'https://unw3gvztdtl64g4zbzuyo6rozi0cvulu.lambda-url.sa-east-1.on.aws/',
    color: '#45B7D1'
  },
  {
    name: 'US (Virginia)',
    name_long: 'us-east-1',
    coordinates: [-77.0469, 38.8048], // N. Virginia
    url: 'https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/',
    color: '#FFBE0B'
  },
  {
    name: 'US (Oregon)',
    name_long: 'us-west-2',
    coordinates: [-122.6765, 45.5231], // Oregon
    url: 'https://22kcgok5hkce3srzl4xksadj740npzoo.lambda-url.us-west-2.on.aws/',
    color: '#88D8B0'
  },
  {
    name: 'India',
    name_long: 'ap-south-1',
    coordinates: [72.8777, 19.0760], // Mumbai
    url: 'https://rchgdkidnerk2gkfiynfgkveje0iujmm.lambda-url.ap-south-1.on.aws/',
    color: '#96CEB4'
  },
  {
    name: 'Ireland',
    name_long: 'eu-west-1',
    coordinates: [-6.2603, 53.3498], // Dublin
    url: 'https://5xaynesucez2tdtndxuyyqmjei0txpcw.lambda-url.eu-west-1.on.aws/',
    color: '#4ECDC4'
  },
  {
    name: 'South Africa',
    name_long: 'af-south-1',
    coordinates: [18.4241, -33.9249], // Cape Town
    url: 'https://bcjj76sx7xfqoz6yc6ngw6ioma0ajqsb.lambda-url.af-south-1.on.aws/',
    color: '#8338EC'
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
  userIpInfo: IpInfoResponse | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
}

// Update type definitions for better compatibility with turf.js
interface CountryProperties {
  A3: string;
  [key: string]: any;
}

interface CountryFeature extends GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, CountryProperties> {}

// Helper function to create boundary points
const createBoundaryPoints = (circle: GeoJSON.Feature<GeoJSON.Polygon>): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: circle.geometry.coordinates[0].map((coord: number[]) => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: coord
    }
  }))
});

const MEASUREMENT_DELAY_MS = 800;

// Helper function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add new interface for the data we'll send
interface TriangulationReport {
  userIpInfo: {ip: string, country: string};
  measurementRounds: MeasurementRound[];
  possibleCountries: string[];
  browserCoordinates?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface MeasurementRound {
  roundNumber: number;
  timestamps: {
    region: string;
    clientStartTime: number;
    masterStartTimestamp: number;
    masterFinishTime: number;
    clientReceivedNonceTime: number;
    clientSendNonceTime: number;
    clientReceivedLatencyTime: number;
    slaveStartTime: number;
    slaveFinishTime: number;
  }[];
  inferredData: {
    latencies: { region: string; value: number }[];
    clockOffsets: { region: string; master: number; slave: number }[];
  };
}

// Move findIntersectingCountries outside of the component to avoid recreating it
const findIntersectingCountries = (circle1: GeoJSON.Feature, circle2: GeoJSON.Feature) => {
  if (!countries || !countries.features) {
    console.error('Countries data not properly loaded:', countries);
    return [];
  }

  try {
    const intersectingCountries = new Set<string>();

    countries.features.forEach(country => {
      if (!country || !country.properties) return;

      const countryFeature = {
        type: 'Feature',
        geometry: country.geometry,
        properties: country.properties
      } as CountryFeature;

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

// Helper function to calculate intersecting countries from circles
const calculateIntersectingCountries = (sortedCircles: {
  circle: GeoJSON.Feature;
  radius: number;
  region: string;
  color: string;
}[]) => {
  // Get the two smallest circles that don't cross antimeridian
  const validCircles = sortedCircles
    .filter(c => !handleAntimeridian(c.circle).crossesAntimeridian)
    .slice(0, 2);

  // Calculate intersecting countries
  if (validCircles.length === 2) {
    try {
      const circle1 = validCircles[0].circle;
      const circle2 = validCircles[1].circle;

      // Check if circles overlap
      if (turf.booleanOverlap(circle1, circle2)) {
        return findIntersectingCountries(circle1, circle2);
      }
    } catch (error) {
      console.error('Error computing overlap:', error);
    }
  }
  return [];
};

function Geolocation({ privacyAccepted, userIpInfo, onPrivacyAcceptChange, captchaToken, setCaptchaToken }: GeolocationProps) {
  const [messages, setMessages] = useState<LatencyMessage[]>([])
  const [clockOffsets, setClockOffsets] = useState<ClockOffset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const circlesLayer = useRef<string[]>([])
  const [possibleCountries, setPossibleCountries] = useState<string[]>([])
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [hasHighLatency, setHasHighLatency] = useState(false);
  const [shareCoordinates, setShareCoordinates] = useState(false);
  const [browserCoordinates, setBrowserCoordinates] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [geoLocationError, setGeoLocationError] = useState<string>('');

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

    // Add warning overlay
    const warningOverlay = document.createElement('div');
    warningOverlay.style.position = 'absolute';
    warningOverlay.style.top = '10px';
    warningOverlay.style.right = '10px';
    warningOverlay.style.backgroundColor = 'rgba(255, 243, 224, 0.9)';
    warningOverlay.style.padding = '8px 12px';
    warningOverlay.style.borderRadius = '4px';
    warningOverlay.style.fontSize = '12px';
    warningOverlay.style.maxWidth = '200px';
    warningOverlay.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    warningOverlay.innerHTML = '⚠️ Visualisation does not work well for latencies > 30 ms';
    mapContainer.current.appendChild(warningOverlay);

    // Add markers for data centers with custom colors
    dataCenters.forEach(dc => {
      // Create a custom colored marker element
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.backgroundColor = dc.color;
      el.style.width = '15px';
      el.style.height = '15px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 2px rgba(0,0,0,0.3)';

      new mapboxgl.Marker({ element: el })
        .setLngLat(dc.coordinates)
        .setPopup(new mapboxgl.Popup().setHTML(dc.name))
        .addTo(map.current!)
    })

    return () => {
      map.current?.remove()
      if (warningOverlay.parentNode) {
        warningOverlay.parentNode.removeChild(warningOverlay);
      }
    }
  }, [])

  // Update circles on the map when latency measurements change
  useEffect(() => {
    if (!map.current) return

    // Remove existing layers and sources
    circlesLayer.current.forEach(id => {
      if (map.current!.getLayer(`${id}-dots`)) {
        map.current!.removeLayer(`${id}-dots`)
      }
      if (map.current!.getSource(id)) {
        map.current!.removeSource(id)
      }
    })

    // Remove possible countries layer if it exists
    if (map.current.getLayer('possible-countries-fill')) {
      map.current.removeLayer('possible-countries-fill')
    }
    if (map.current.getLayer('possible-countries-border')) {
      map.current.removeLayer('possible-countries-border')
    }
    if (map.current.getSource('possible-countries')) {
      map.current.removeSource('possible-countries')
    }

    circlesLayer.current = []

    // Group messages by region and find minimum latency for each
    const minLatencyByRegion = messages.reduce((acc, msg) => {
      if (msg.region === 'System' || msg.region === 'Error') return acc;
      if (!acc[msg.region] || msg.latency < acc[msg.region].latency) {
        acc[msg.region] = msg;
      }
      return acc;
    }, {} as Record<string, LatencyMessage>);

    // Get all circles sorted by radius
    const sortedCircles = Object.values(minLatencyByRegion)
      .map(msg => {
        const dataCenter = dataCenters.find(dc => dc.name === msg.region);
        if (!dataCenter) return null;
        
        const radiusKm = internetLatencyToDistance(msg.latency);
        const center = turf.point(dataCenter.coordinates);
        const circle = turf.circle(center, radiusKm, {
          steps: 128,
          units: 'kilometers'
        });
        
        return {
          circle,
          radius: radiusKm,
          region: msg.region,
          color: dataCenter.color
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.radius - b.radius);

    // Plot all circles as dots
    sortedCircles.forEach((circleData, index) => {
      const circleId = `circle-${index}`;
      circlesLayer.current.push(circleId);

      map.current!.addSource(circleId, {
        type: 'geojson',
        data: createBoundaryPoints(circleData.circle)
      });

      map.current!.addLayer({
        id: `${circleId}-dots`,
        type: 'circle',
        source: circleId,
        paint: {
          'circle-radius': 2,
          'circle-color': circleData.color,
          'circle-opacity': 0.6
        }
      });
    });

    // Calculate intersecting countries using common function
    const intersectingCountries = calculateIntersectingCountries(sortedCircles);
    setPossibleCountries(intersectingCountries);

    // Add countries to map if there are any
    if (intersectingCountries.length > 0 && countries && countries.features) {
      // Create a feature collection of possible countries
      const possibleCountriesFeatures = intersectingCountries
        .map(countryCode => {
          const country = countries.features.find(f => f.properties?.A3 === countryCode);
          if (!country) return null;
          return {
            type: 'Feature',
            geometry: country.geometry,
            properties: country.properties
          } as CountryFeature;
        })
        .filter((f): f is CountryFeature => f !== null);

      if (possibleCountriesFeatures.length > 0) {
        // Add possible countries to the map
        map.current.addSource('possible-countries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: possibleCountriesFeatures
          } as GeoJSON.FeatureCollection<GeoJSON.Geometry>
        });

        // Add fill layer
        map.current.addLayer({
          id: 'possible-countries-fill',
          type: 'fill',
          source: 'possible-countries',
          paint: {
            'fill-color': '#007cbf',
            'fill-opacity': 0.2
          }
        });

        // Add border layer
        map.current.addLayer({
          id: 'possible-countries-border',
          type: 'line',
          source: 'possible-countries',
          paint: {
            'line-color': '#007cbf',
            'line-width': 1,
            'line-opacity': 0.5
          }
        });
      }
    }
  }, [messages])

  const triggerTriangulationMeasurements = async () => {
    setIsLoading(true)
    setMessages([])
    setClockOffsets([])
    setProgress(0)
    setHasHighLatency(false)
    
    const allMeasurementRounds: MeasurementRound[] = [];
    let firstNonce: string | undefined;  // Track the first nonce
    const localMessages: LatencyMessage[] = [];  // Local array to collect messages
    
    for (let measurementIndex = 0; measurementIndex < 3; measurementIndex++) {
      const round: MeasurementRound = {
        roundNumber: measurementIndex + 1,
        timestamps: [],
        inferredData: {
          latencies: [],
          clockOffsets: []
        }
      };

      try {
        // Only warm up in the first round
        if (measurementIndex === 0) {
          setCurrentActivity('Warming up connections...')
          try {
            await Promise.all(dataCenters.map((region) => fetch(region.url)))
          } catch (_) {}
        }

        setProgress((measurementIndex * 100) / 3)
        
        localMessages.push({ 
          region: 'System', 
          latency: 0, 
          halfRoundTripLatency: 0,
          measurementIndex 
        });
        setMessages(prev => [...prev, localMessages[localMessages.length - 1]]);

        // Wait between rounds (except for the first one)
        if (measurementIndex > 0) {
          setCurrentActivity(`Waiting between measurement rounds (${measurementIndex + 1}/3)...`)
          await delay(MEASUREMENT_DELAY_MS);
        }

        setCurrentActivity(`Running measurement round ${measurementIndex + 1}/3: `)

        // Get nonce for this round
        const clientStartTimestamp = new Date().getTime()
        const nonceResponse = await fetch(
          `https://2snia32ceolmfhv45btw62rep40sfndz.lambda-url.us-east-1.on.aws/?clientStartTimestamp=${clientStartTimestamp}`
        )
        const clientReceivedNonceTimestamp = new Date().getTime()
        const nonceResponseData = (await nonceResponse.json()) as NonceResponse | undefined
        const roundNonce = nonceResponseData?.nonce
        const masterStartTimestamp = nonceResponseData?.lambdaStartTimestamp || 0 
        const masterFinishTime = nonceResponseData?.nonceSentTime || 0


        // Store first nonce we receive in the first round
        if (measurementIndex === 0 && roundNonce) {
          firstNonce = roundNonce;
        }

        await Promise.all(
          dataCenters.map(async (region) => {
            const clientSendNonceTime = new Date().getTime()

            const response = await fetch(`${region.url}?nonce=${roundNonce}&clientReceivedNonceTimestamp=${
              clientReceivedNonceTimestamp}`)
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

              // Update activity text immediately when each measurement comes in
              setCurrentActivity(prev => 
                prev + `${region.name}: ${Math.round(latency)}ms, `
              );

              const latencyMessage = { 
                region: region.name, 
                latency,
                halfRoundTripLatency,
                measurementIndex
              };
              localMessages.push(latencyMessage);
              setMessages(prev => [...prev, latencyMessage]);

              // Add timestamps to round data
              round.timestamps.push({
                region: region.name_long,
                clientStartTime: clientStartTimestamp,
                masterStartTimestamp: masterStartTimestamp,
                masterFinishTime: masterFinishTime,
                clientReceivedNonceTime: clientReceivedNonceTimestamp,
                clientSendNonceTime: clientSendNonceTime,
                clientReceivedLatencyTime: clientReceivedLatencyResponseTimestamp,
                slaveStartTime: LatencyResponseData.lambdaStartTimestamp,
                slaveFinishTime: LatencyResponseData.latencyResponseTimestamp
              });

              // Calculate and store inferred data
              round.inferredData.latencies.push({
                region: region.name_long,
                value: latency
              });

              round.inferredData.clockOffsets.push({
                region: region.name_long,
                master: clockOffset_master,
                slave: clockOffset_slave
              });
            }
          })
        );

        // Add completed round to both state and local array
        allMeasurementRounds.push(round);
      } catch (error) {
        console.error('Triangulation error:', error)
        localMessages.push({ 
          region: 'Error', 
          latency: 0,
          halfRoundTripLatency: 0,
          measurementIndex
        });
        setMessages(prev => [...prev, localMessages[localMessages.length - 1]]);
      }
    }

    // After all measurements complete - use localMessages instead of messages state
    const minLatencyByRegion = localMessages.reduce((acc, msg) => {
      if (msg.region === 'System' || msg.region === 'Error') return acc;
      if (!acc[msg.region] || msg.latency < acc[msg.region].latency) {
        acc[msg.region] = msg;
      }
      return acc;
    }, {} as Record<string, LatencyMessage>);

    const sortedCircles = Object.values(minLatencyByRegion)
      .map(msg => {
        const dataCenter = dataCenters.find(dc => dc.name === msg.region);
        if (!dataCenter) return null;
        
        const radiusKm = internetLatencyToDistance(msg.latency);
        const center = turf.point(dataCenter.coordinates);
        const circle = turf.circle(center, radiusKm, {
          steps: 128,
          units: 'kilometers'
        });
        
        return {
          circle,
          radius: radiusKm,
          region: msg.region,
          color: dataCenter.color
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.radius - b.radius);

    // Use the same calculation function
    const detectedCountries = calculateIntersectingCountries(sortedCircles);

    const reportData: TriangulationReport = {
      userIpInfo: {ip: userIpInfo?.ip || '', country: userIpInfo?.geo.country || ''},
      measurementRounds: allMeasurementRounds,
      possibleCountries: detectedCountries,
      ...(browserCoordinates && shareCoordinates ? { browserCoordinates } : {})
    };

    try {
      await fetch(`https://lzajzm5uwcrbkn3ndakafsfsga0rcqib.lambda-url.us-east-1.on.aws/?nonce=${firstNonce || 'no_nonce'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData)
      });
    } catch (error) {
      console.error('Error sending measurement report:', error);
    }

    setProgress(100);
    setCurrentActivity('');
    setIsLoading(false);

    // Check latencies using localMessages
    const latencies = localMessages
      .filter(msg => msg.region !== 'System' && msg.region !== 'Error')
      .map(msg => msg.latency);
    
    if (latencies.length > 0 && latencies.every(latency => latency > 100)) {
      setHasHighLatency(true);
    }
  }

  const handleShareCoordinatesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setShareCoordinates(checked);
    setGeoLocationError(''); // Reset error when trying again
    
    if (checked) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000, // 10 second timeout
            maximumAge: 0,  // Don't use cached position
          });
        });
        
        setBrowserCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      } catch (error) {
        console.error('Error getting coordinates:', error);
        setShareCoordinates(false);
        if (error instanceof GeolocationPositionError) {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setGeoLocationError('Location access was denied. Please enable location services in your browser settings.');
              break;
            case error.POSITION_UNAVAILABLE:
              setGeoLocationError('Location information is unavailable.');
              break;
            case error.TIMEOUT:
              setGeoLocationError('Location request timed out.');
              break;
            default:
              setGeoLocationError('An unknown error occurred while retrieving location.');
          }
        } else {
          setGeoLocationError('Failed to get location information.');
        }
      }
    } else {
      setBrowserCoordinates(null);
    }
  };

  // Update the Plot data type
  const plotData: Data[] = dataCenters.map(dc => ({
    name: dc.name,
    type: 'scatter' as const,
    mode: 'text+markers' as const,
    x: messages
      .filter(msg => msg.region === dc.name)
      .map(msg => msg.latency),
    y: clockOffsets
      .filter(offset => offset.region === dc.name)
      .map(offset => offset.offset_slave),
    text: clockOffsets
      .filter(offset => offset.region === dc.name)
      .map(offset => `#${offset.measurementIndex! + 1}`),
    textposition: 'top center' as const,
    marker: {
      color: dc.color,
      size: 8
    }
  }));

  return (
    <Paper sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Geolocation via Network Latency <span style={{ fontSize: '20px', color: '#cc8888' }}>(Beta)</span>
      </Typography>
      <Typography paragraph>
        This allows us to estimate your location to validate where the hardware that is attached to your IP address is located. Read more <a href="/geolocation_via_latency.html">here</a>
      </Typography>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        textAlign="center"
        captchaToken={captchaToken || '_'}
        setCaptchaToken={setCaptchaToken}
      />

      <Box sx={{ my: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={shareCoordinates}
              onChange={handleShareCoordinatesChange}
              disabled={isLoading}
            />
          }
          label={
            <Typography variant="body2">
              Share browser location coordinates for validation
              {browserCoordinates && (
                <span style={{ color: 'text.secondary', marginLeft: '8px' }}>
                  ({browserCoordinates.latitude.toFixed(2)}, {browserCoordinates.longitude.toFixed(2)})
                </span>
              )}
            </Typography>
          }
        />
        {geoLocationError && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {geoLocationError}
          </Typography>
        )}
      </Box>

      <Box sx={{ my: 4, mb: 6 }}>
        <Button 
          variant="contained" 
          onClick={triggerTriangulationMeasurements}
          disabled={isLoading || !privacyAccepted}
        >
          {isLoading ? 'Testing...' : 'Test Network Triangulation'}
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              sx={{ 
                flexGrow: 1,
                height: 8,
                borderRadius: 1
              }} 
            />
            <Typography variant="body2" color="textSecondary" sx={{ ml: 2, minWidth: 35 }}>
              {Math.round(progress)}%
            </Typography>
          </Box>
          {currentActivity && (
            <Typography variant="body2" color="textSecondary" align="center">
              {currentActivity}
            </Typography>
          )}
        </Box>
      )}
      
      <Box sx={{ my: 4, height: 400 }} ref={mapContainer} />

      {clockOffsets.length > 0 && messages.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Latency vs Clock Offset:
          </Typography>
          <Box sx={{ height: 300 }}>
            <Plot
              data={plotData}
              layout={{
                margin: { t: 30, r: 120, l: 70, b: 50 },
                height: 300,
                xaxis: {
                  title: {
                    text: 'Latency (ms)',
                    standoff: 10
                  },
                  zeroline: true
                },
                yaxis: {
                  title: {
                    text: 'Clock Offset (ms)',
                    standoff: 10
                  },
                  zeroline: true,
                  tickformat: '.1f',
                  automargin: true
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

      {possibleCountries.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Possible Countries:
          </Typography>
          <Typography color="textSecondary">
            Based on the measured latencies, you are assumed to be in one of the following countries: {' '}
            {possibleCountries.join(', ')}
          </Typography>
        </Box>
      )}

      {hasHighLatency && (
        <Box sx={{ mt: 2, p: 2, bgcolor: '#fff3e0', borderRadius: 1 }}>
          <Typography color="warning.dark">
            ⚠️ Warning: All measured latencies are above 100ms. The location results may be unreliable due to slow network conditions.
          </Typography>
        </Box>
      )}

      {userIpInfo && (
        <Box sx={{ mt: 2, p: 2, bgcolor: '#eeeeee', borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>
            IP Address Data:
          </Typography>
          <p>
              Independent of the network latency triangulation, publicly available data sets allow the inference of one's location in most cases.
              The following IP address data is powered by <a href="https://ipinfo.io">IPinfo</a>.
              <br/>
              IP Address: {userIpInfo.ip}
              <br/>
              Country: <b>{userIpInfo.geo.country_name}</b>
              <br/>
              Autonomous System Name: {userIpInfo.geo.as_name}
              
          </p>
        </Box>
      )}
    </Paper>
  )
}

export default Geolocation
