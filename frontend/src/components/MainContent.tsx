import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy } from 'react'
import Newsletter from './ui/Newsletter'
import Popular from './ui/Popular'
import CreatePoll from './ui/CreatePoll'
import { IpInfoResponse } from '../App'

// Lazy load Geolocation component
const Geolocation = lazy(() => import('./ui/Geolocation'))

interface MainContentProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
}

function MainContent({ privacyAccepted, userIpInfo, onPrivacyAcceptChange, query, captchaToken, setCaptchaToken }: MainContentProps) {
  return (
    <main className="content">
      <Routes>
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="popular" element={<Popular 
          privacyAccepted={privacyAccepted} 
          userIp={userIpInfo?.ip || null} 
          onPrivacyAcceptChange={onPrivacyAcceptChange}
          query={query}
          captchaToken={captchaToken}
          setCaptchaToken={setCaptchaToken}
        />} />
        <Route path="create" element={<CreatePoll />} />
        <Route path="geolocation" element={
          <Suspense fallback={
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div>Loading location tools...</div>
            </div>
          }>
            <Geolocation 
              privacyAccepted={privacyAccepted} 
              userIpInfo={userIpInfo} 
              onPrivacyAcceptChange={onPrivacyAcceptChange}
              captchaToken={captchaToken}
              setCaptchaToken={setCaptchaToken}
            />
          </Suspense>
        } />
        <Route path="/" element={<Navigate to="/ui/popular" replace />} />
      </Routes>
    </main>
  )
}

export default MainContent 
