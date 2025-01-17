import { Routes, Route, Navigate } from 'react-router-dom'
import Newsletter from './ui/Newsletter'
import Popular from './ui/Popular'
import CreatePoll from './ui/CreatePoll'
import Geolocation from './ui/Geolocation'

interface MainContentProps {
  privacyAccepted: boolean
  userIp: string | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
}

function MainContent({ privacyAccepted, userIp, onPrivacyAcceptChange, query }: MainContentProps) {
  return (
    <main className="content">
      <Routes>
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="popular" element={<Popular 
          privacyAccepted={privacyAccepted} 
          userIp={userIp} 
          onPrivacyAcceptChange={onPrivacyAcceptChange}
          query={query}
        />} />
        <Route path="create" element={<CreatePoll />} />
        <Route path="geolocation" element={<Geolocation />} />
        <Route path="/" element={<Navigate to="/ui/popular" replace />} />
      </Routes>
    </main>
  )
}

export default MainContent 
