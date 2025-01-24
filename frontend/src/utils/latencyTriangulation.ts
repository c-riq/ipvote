export interface LatencyMessage {
  region: string
  latency: number
  halfRoundTripLatency: number
  measurementIndex?: number
}

export interface NonceResponse {
  nonce: string
  lambdaStartTimestamp: number
  nonceSentTime: number
}

export interface LatencyResponse {
  lambdaStartTimestamp: number
  latencyResponseTimestamp: number
  nonce: string
}

export interface DataCenter {
  name: string
  name_long: string
  coordinates: [number, number] // [longitude, latitude]
  url: string
  color: string
}

export interface ClockOffset {
  region: string
  offset_master: number
  offset_slave: number
  measurementIndex?: number
}

export interface MeasurementRound {
  roundNumber: number
  timestamps: {
    region: string
    clientStartTime: number
    masterStartTimestamp: number
    masterFinishTime: number
    clientReceivedNonceTime: number
    clientSendNonceTime: number
    clientReceivedLatencyTime: number
    slaveStartTime: number
    slaveFinishTime: number
  }[]
  inferredData: {
    latencies: { region: string; value: number }[]
    clockOffsets: { region: string; master: number; slave: number }[]
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

export const dataCenters: DataCenter[] = [
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

// Helper function for delay
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const MEASUREMENT_ROUND_DELAY_MS = 800

export async function performLatencyMeasurements(
  onProgress: (progress: number) => void,
  onActivity: (activity: string) => void,
  onMessage: (message: LatencyMessage) => void,
  onClockOffset: (offset: ClockOffset) => void
): Promise<{
  allMeasurementRounds: MeasurementRound[]
  firstNonce: string | undefined
}> {
  const allMeasurementRounds: MeasurementRound[] = []
  let firstNonce: string | undefined

  for (let measurementIndex = 0; measurementIndex < 3; measurementIndex++) {
    const round: MeasurementRound = {
      roundNumber: measurementIndex + 1,
      timestamps: [],
      inferredData: {
        latencies: [],
        clockOffsets: []
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
      
      onMessage({ 
        region: 'System', 
        latency: 0, 
        halfRoundTripLatency: 0,
        measurementIndex 
      })

      // Wait between rounds (except for the first one)
      if (measurementIndex > 0) {
        onActivity(`Waiting between measurement rounds (${measurementIndex + 1}/3)...`)
        await delay(MEASUREMENT_ROUND_DELAY_MS)
      }

      onActivity(`Running measurement round ${measurementIndex + 1}/3: `)

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
        firstNonce = roundNonce
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

            onClockOffset({
              region: region.name,
              offset_master: clockOffset_master,
              offset_slave: clockOffset_slave,
              measurementIndex
            })

            const latency = (LatencyResponseData.lambdaStartTimestamp - clockOffset_slave) - clientSendNonceTime
            const halfRoundTripLatency = (clientReceivedLatencyResponseTimestamp - clientSendNonceTime - 1000) / 2

            onMessage({ 
              region: region.name, 
              latency,
              halfRoundTripLatency,
              measurementIndex
            })

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
            })

            // Calculate and store inferred data
            round.inferredData.latencies.push({
              region: region.name_long,
              value: latency
            })

            round.inferredData.clockOffsets.push({
              region: region.name_long,
              master: clockOffset_master,
              slave: clockOffset_slave
            })
          }
        })
      )

      allMeasurementRounds.push(round)
    } catch (error) {
      console.error('Triangulation error:', error)
      onMessage({ 
        region: 'Error', 
        latency: 0,
        halfRoundTripLatency: 0,
        measurementIndex
      })
    }
  }

  return { allMeasurementRounds, firstNonce }
}

export async function triggerLatencyMeasurementIfNeeded(currentIp: string): Promise<void> {
  const STORAGE_KEY = 'lastMeasuredIp';
  const lastMeasuredIp = localStorage.getItem(STORAGE_KEY);

  if (lastMeasuredIp === currentIp) {
    return;
  }

  await performLatencyMeasurements(
    () => {},
    () => {},
    () => {},
    () => {}
  );

  localStorage.setItem(STORAGE_KEY, currentIp);

}
