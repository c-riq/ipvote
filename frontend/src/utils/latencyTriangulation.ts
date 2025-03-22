import { DataCenter, dataCenters, delay, MEASUREMENT_ROUND_DELAY_MS } from './dataCenters'

export interface TOTPResponse {
  token: string
}

export interface LatencyMessage {
  region: string
  latency: number
  measurementIndex?: number
}

export interface MeasurementRound {
  roundNumber: number
  timestamps: {
    region: string
    clientStartTime: number
    serverStartTime: number
    serverFinishTime: number
    clientFinishTime: number
    TOTP2: string
  }[]
  inferredData: {
    latencies: { region: string; value: number }[]
  }
}

export interface TriangulationReport {
    userIpInfo: {ip: string, country: string}
    measurementRounds: MeasurementRound[]
    possibleCountries: string[]
    browserCoordinates?: {
      latitude: number
      longitude: number
      accuracy: number
    }
  }

async function getTOTP1(datacenter: DataCenter): Promise<string> {
  const response = await fetch(`${datacenter.url}?getTOTP1=true`)
  if (!response.ok) {
    throw new Error(`Failed to get TOTP1 from ${datacenter.name}`)
  }
  return await response.text()
}

async function getTOTP2(datacenter: DataCenter, totp1: string): Promise<{token: string, latency: number}> {
  const response = await fetch(`${datacenter.url}?getTOTP2=true&TOTP1=${encodeURIComponent(totp1)}`)
  if (!response.ok) {
    throw new Error(`Failed to get TOTP2 from ${datacenter.name}`)
  }
  const responseText = await response.text()
  const [iv, token, latency] = responseText.split(';')
  return { token: `${iv};${token}`, latency: parseFloat(latency) / 2 }
}

export async function performLatencyMeasurements(
  onProgress: (progress: number) => void,
  onActivity: (activity: string) => void,
  onMessage: (message: LatencyMessage) => void
): Promise<{
  allMeasurementRounds: MeasurementRound[]
}> {
  const allMeasurementRounds: MeasurementRound[] = []

  for (let measurementIndex = 0; measurementIndex < 3; measurementIndex++) {
    const round: MeasurementRound = {
      roundNumber: measurementIndex + 1,
      timestamps: [],
      inferredData: {
        latencies: []
      }
    }

    try {
      // Only warm up in the first round
      if (measurementIndex === 0) {
        onActivity('Warming up connections...')
        try {
          await Promise.all(dataCenters.map((region) => fetch(region.url)))
        } catch (_) {}
      }

      onProgress((measurementIndex * 100) / 3)
      
      onActivity(`Running measurement round ${measurementIndex + 1}/3: `)

      // Wait between rounds (except for the first one)
      if (measurementIndex > 0) {
        onActivity(`Waiting between measurement rounds (${measurementIndex + 1}/3)...`)
        await delay(MEASUREMENT_ROUND_DELAY_MS)
      }

      await Promise.all(
        dataCenters.map(async (region) => {
          const clientStartTime = Date.now()
          
          // Get TOTP1
          const totp1 = await getTOTP1(region)
          
          // Get TOTP2 with latency
          const { token: totp2, latency } = await getTOTP2(region, totp1)
          
          const clientFinishTime = Date.now()

          onMessage({
            region: region.name,
            latency,
            measurementIndex
          })

          round.timestamps.push({
            region: region.name_long,
            clientStartTime,
            serverStartTime: clientStartTime, // Not needed anymore but keeping for compatibility
            serverFinishTime: clientFinishTime, // Not needed anymore but keeping for compatibility
            clientFinishTime,
            TOTP2: totp2
          })

          round.inferredData.latencies.push({
            region: region.name_long,
            value: latency
          })
        })
      )

      allMeasurementRounds.push(round)

    } catch (error) {
      console.error('Triangulation error:', error)
      onMessage({
        region: 'Error',
        latency: 0,
        measurementIndex
      })
    }
  }

  return { allMeasurementRounds }
}

export async function getMinLatencyTokens(currentIp: string): Promise<string[]> {
  const STORAGE_KEY = 'latencyMeasurement';
  const existingMeasurement = localStorage.getItem(STORAGE_KEY);
  if (existingMeasurement) {
    const result = JSON.parse(existingMeasurement);
    if (result.ip === currentIp) {
      return result.latencyTokens;
    }
  }

  const result = await performLatencyMeasurements(
    () => {},
    () => {},
    () => {},
  );
  const allMeasurementRounds = result.allMeasurementRounds;

  // Create a map to track minimum latency and corresponding TOTP2 for each region
  const regionLatencyMap = new Map<string, { latency: number; token: string }>();

  for (const round of allMeasurementRounds) {
    for (let i = 0; i < round.timestamps.length; i++) {
      const timestamp = round.timestamps[i];
      const latency = round.inferredData.latencies[i].value;
      
      if (!regionLatencyMap.has(timestamp.region) || 
          latency < regionLatencyMap.get(timestamp.region)!.latency) {
        regionLatencyMap.set(timestamp.region, {
          latency: latency,
          token: timestamp.TOTP2
        });
      }
    }
  }

  // Convert map to array of formatted strings
  const latencyTokens: string[] = Array.from(regionLatencyMap.entries())
    .map(([region, data]) => `${region};${data.token}`);

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ip: currentIp, latencyTokens}));
  return latencyTokens;
}
