import { useState, useEffect, useRef } from 'react'
import { Typography, Paper, Button, Box, LinearProgress, Checkbox, FormControlLabel } from '@mui/material'
import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'
import Plot from 'react-plotly.js'
import 'mapbox-gl/dist/mapbox-gl.css'
import PrivacyAccept from './PrivacyAccept'
import { Data } from 'plotly.js'
import { performLatencyMeasurements, LatencyMessage, TriangulationReport } from '../../utils/latencyTriangulation'
import { dataCenters } from '../../utils/dataCenters'
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
import { LOG_TRIANGULATION_TEST_HOST } from '../../constants'
const countries = countriesData() as CountryData

// Replace with your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''


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
    setProgress(0)
    setHasHighLatency(false)
    
    const { allMeasurementRounds } = await performLatencyMeasurements(
      (progress) => setProgress(progress),
      (activity) => setCurrentActivity(activity),
      (message) => setMessages(prev => [...prev, message])
    )

    // Use the same calculation function
    const minLatencyByRegion = messages.reduce((acc, msg) => {
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
      browserCoordinates: shareCoordinates && browserCoordinates ? browserCoordinates : undefined
    };

    try {
      await fetch(`${LOG_TRIANGULATION_TEST_HOST}`, {
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
    const latencies = messages
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
    mode: 'markers' as const,
    x: messages
      .filter(msg => msg.region === dc.name)
      .map(msg => msg.measurementIndex !== undefined ? msg.measurementIndex + 1 : 0),
    y: messages
      .filter(msg => msg.region === dc.name)
      .map(msg => msg.latency),
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

      {messages.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Latency Measurements:
          </Typography>
          <Box sx={{ height: 300 }}>
            <Plot
              data={plotData}
              layout={{
                margin: { t: 30, r: 120, l: 70, b: 50 },
                height: 300,
                xaxis: {
                  title: {
                    text: 'Measurement Round',
                    standoff: 10
                  },
                  zeroline: true,
                  tickmode: 'linear',
                  tick0: 1,
                  dtick: 1
                },
                yaxis: {
                  title: {
                    text: 'Latency (ms)',
                    standoff: 10
                  },
                  zeroline: true,
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
