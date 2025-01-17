import { Routes, Route, Navigate } from 'react-router-dom'
import Newsletter from './ui/Newsletter'
import Popular from './ui/Popular'

function MainContent() {
  return (
    <main className="content">
      <Routes>
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="popular" element={<Popular />} />
        <Route path="/" element={<Navigate to="/ui/popular" replace />} />
      </Routes>
    </main>
  )
}

export default MainContent 
