export interface DataCenter {
  name: string
  name_long: string
  coordinates: [number, number] // [longitude, latitude]
  url: string
  color: string
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

