import { useState, useEffect } from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import Poll from './components/Poll'
import './App.css'

interface PrivacyState {
  accepted: boolean;
  timestamp?: string;  // ISO string format
}

export interface IpInfoResponse {
  ip: string
  geo: {
    country: string | null
    country_name: string | null
    continent: string | null
    continent_name: string | null
    asn: string | null
    as_name: string | null
    as_domain: string | null
  }
  timestamp: string
  attribution: string
}

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean>(() => {
    const stored = localStorage.getItem('privacyState')
    if (stored) {
      const state: PrivacyState = JSON.parse(stored)
      return state.accepted
    }
    return false
  })
  const [userIpInfo, setUserIpInfo] = useState<IpInfoResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth > 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    // Fetch user's IP
    fetch('https://awcntp2t5izba44go77lc4evvy0ewfzy.lambda-url.us-east-1.on.aws/')
      .then(response => response.json() as Promise<IpInfoResponse>)
      .then(data => setUserIpInfo(data))
  }, [])

  const lightTheme = createTheme({
    palette: {
      mode: 'light',
      background: {
        default: '#DAE0E6',
        paper: '#FFFFFF',
      },
      primary: {
        main: '#0079d3',
      },
    },
  })

  const handlePrivacyAcceptChange = (accepted: boolean) => {
    console.log('onPrivacyAcceptChange', accepted)
    setPrivacyAccepted(accepted)
    const privacyState: PrivacyState = {
      accepted,
      timestamp: accepted ? new Date().toISOString() : undefined
    }
    localStorage.setItem('privacyState', JSON.stringify(privacyState))
  }

  return (
    <BrowserRouter>
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <div className="app-container">
          <Header 
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <div className="main-content">
            <Sidebar isOpen={isSidebarOpen} />
            <div>
              <Routes>
                {/* UI routes */}
                <Route path="/ui/*" element={<MainContent 
                  privacyAccepted={privacyAccepted} 
                  userIpInfo={userIpInfo} 
                  onPrivacyAcceptChange={handlePrivacyAcceptChange}
                  query={searchQuery}
                />} />
                
                {/* Routes with dots (e.g., file extensions) */}
                <Route path="*.*" element={<MainContent 
                  privacyAccepted={privacyAccepted} 
                  userIpInfo={userIpInfo} 
                  onPrivacyAcceptChange={handlePrivacyAcceptChange}
                  query={searchQuery}
                />} />
                
                {/* All other routes show Poll component */}
                <Route path="/*" element={
                  <Poll 
                    privacyAccepted={privacyAccepted}
                    userIp={userIpInfo?.ip || null}
                    onPrivacyAcceptChange={handlePrivacyAcceptChange}
                  />
                } />
                
                {/* Default route redirects to popular polls */}
                <Route path="/" element={<Navigate to="/ui/popular" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
