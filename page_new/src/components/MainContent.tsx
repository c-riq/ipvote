import { Routes, Route, Navigate } from 'react-router-dom'
import Newsletter from './ui/Newsletter'
import Popular from './ui/Popular'
import CreatePoll from './ui/CreatePoll'

interface MainContentProps {
  privacyAccepted: boolean
  userIp: string | null
  onPrivacyAcceptChange: (accepted: boolean) => void
}

function MainContent({ privacyAccepted, userIp, onPrivacyAcceptChange }: MainContentProps) {
  return (
    <main className="content">
      <Routes>
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="popular" element={<Popular privacyAccepted={privacyAccepted} userIp={userIp} onPrivacyAcceptChange={onPrivacyAcceptChange} />} />
        <Route path="create" element={<CreatePoll />} />
        <Route path="/" element={<Navigate to="/ui/popular" replace />} />
      </Routes>
    </main>
  )
}

export default MainContent 
