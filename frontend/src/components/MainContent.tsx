import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy } from 'react'
import Newsletter from './ui/Newsletter'
import Popular from './ui/Popular'
import CreatePoll from './ui/CreatePoll'
import { IpInfoResponse, PhoneVerificationState } from '../App'

// Lazy load components
const Geolocation = lazy(() => import('./ui/Geolocation'))
const MyIdentity = lazy(() => import('./ui/MyIdentity'))
const DelegateVoting = lazy(() => import('./ui/DelegateVoting'))
const UserProfile = lazy(() => import('./ui/UserProfile'))

interface MainContentProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  phoneVerification: PhoneVerificationState | null
  setPhoneVerification: (phoneVerification: PhoneVerificationState | null) => void
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
}

function MainContent({ privacyAccepted, userIpInfo, onPrivacyAcceptChange, 
  query, captchaToken, setCaptchaToken, phoneVerification, setPhoneVerification }: MainContentProps) {
  return (
    <main className="content">
      <Routes>
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="popular" element={<Popular 
          privacyAccepted={privacyAccepted} 
          userIpInfo={userIpInfo} 
          onPrivacyAcceptChange={onPrivacyAcceptChange}
          query={query}
          captchaToken={captchaToken}
          setCaptchaToken={setCaptchaToken}
          phoneVerification={phoneVerification}
        />} />
        <Route path="create" element={<CreatePoll />} />
        <Route path="identity" element={
          <Suspense fallback={
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div>Loading identity tools...</div>
            </div>
          }>
            <MyIdentity 
              privacyAccepted={privacyAccepted}
              onPrivacyAcceptChange={onPrivacyAcceptChange}
              captchaToken={captchaToken}
              setCaptchaToken={setCaptchaToken}
              userIpInfo={userIpInfo}
              phoneVerification={phoneVerification}
              setPhoneVerification={setPhoneVerification}
            />
          </Suspense>
        } />
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
        <Route path="delegate" element={
          <Suspense fallback={
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div>Loading delegate settings...</div>
            </div>
          }>
            <DelegateVoting 
              privacyAccepted={privacyAccepted}
              onPrivacyAcceptChange={onPrivacyAcceptChange}
              userIpInfo={userIpInfo}
              phoneVerification={phoneVerification}
            />
          </Suspense>
        } />
        <Route path="user/:userId" element={
          <Suspense fallback={
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div>Loading user profile...</div>
            </div>
          }>
            <UserProfile 
              privacyAccepted={privacyAccepted}
              onPrivacyAcceptChange={onPrivacyAcceptChange}
              userIpInfo={userIpInfo}
            />
          </Suspense>
        } />
        <Route path="/" element={<Navigate to="/ui/popular" replace />} />
      </Routes>
    </main>
  )
}

export default MainContent 
