import { useState, useEffect } from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import Poll from './components/Poll'
import './App.css'
import { IP_INFO_HOST } from './constants'
import { HelmetProvider } from 'react-helmet-async'

interface PrivacyState {
  accepted: boolean;
  timestamp?: string;  // ISO string format
}

interface CaptchaState {
  token: string;
  ip: string;
  timestamp: string;
}

export interface PhoneVerificationState {
  phoneNumber: string;
  token: string;
  timestamp: string;
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
  const [_, setIsLoggedIn] = useState(() => {
    const sessionToken = localStorage.getItem('sessionToken');
    return !!sessionToken;
  });
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean>(() => {
    const stored = localStorage.getItem('privacyState')
    if (stored) {
      const state: PrivacyState = JSON.parse(stored)
      return state.accepted
    }
    return false
  })
  const [userIpInfo, setUserIpInfo] = useState<IpInfoResponse | null>(() => {
    const stored = localStorage.getItem('userIpInfo');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [captchaState, setCaptchaState] = useState<CaptchaState | null>(() => {
    const stored = localStorage.getItem('captchaState');
    if (stored) {
      return JSON.parse(stored);
    }
    return undefined;
  });
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState<PhoneVerificationState | null>(() => {
    const stored = localStorage.getItem('phoneVerification');
    if (stored) {
      const verification = JSON.parse(stored);
      // Check if verification is less than 31 days old
      const isValid = Date.now() - new Date(verification.timestamp).getTime() < 31 * 24 * 60 * 60 * 1000;
      return isValid ? verification : null;
    }
    return null;
  });

  useEffect(() => {
    if (captchaState) {
      const age = Date.now() - new Date(captchaState.timestamp).getTime();
      console.log('Captcha age', age);
      if (age < 7 * 24 * 60 * 60 * 1000) {
        if (captchaState.ip === userIpInfo?.ip) {
          setCaptchaVerified(true);
          return;
        } else {
          console.error('Captcha IP does not match user IP', captchaState.ip, userIpInfo?.ip);
        }
      }
    }
    setCaptchaVerified(false);
  }, [userIpInfo, captchaState]);

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth > 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (userIpInfo) {
      if (!captchaState || captchaState.ip === userIpInfo.ip) {
        if (userIpInfo.timestamp && Date.now() < new Date(userIpInfo.timestamp).getTime() + 1 * 60 * 1000) {
          return;
        }
      }
    }
    // Fetch user's IP
    fetch(IP_INFO_HOST)
      .then(response => response.json() as Promise<IpInfoResponse>)
      .then(data => {
        setUserIpInfo(data)
        localStorage.setItem('userIpInfo', JSON.stringify({...data, timestamp: new Date().toISOString()}))
      })
  }, [captchaState])

  // Add effect to listen for session token changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sessionToken') {
        setIsLoggedIn(!!e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
    setPrivacyAccepted(accepted);
    const privacyState: PrivacyState = {
      accepted,
      timestamp: accepted ? new Date().toISOString() : undefined
    }
    localStorage.setItem('privacyState', JSON.stringify(privacyState))
  }

  const handleCaptchaToken = async (token: string) => {
    if (userIpInfo?.ip) {
      const captchaState: CaptchaState = {
        token,
        ip: userIpInfo.ip,
        timestamp: new Date().toISOString()
        };
        localStorage.setItem('captchaState', JSON.stringify(captchaState));
        setCaptchaState(captchaState);
    }
    else {
      console.error('User IP is not available');
    }
  };

  const handleMainContentClick = () => {
    // Only close sidebar on mobile
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <HelmetProvider>
      <BrowserRouter>
        <ThemeProvider theme={lightTheme}>
          <CssBaseline />
          <div className="app-container">
            <Header 
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              phoneVerification={phoneVerification}
            />
            <div className="main-content">
              <Sidebar isOpen={isSidebarOpen} />
              <div onClick={handleMainContentClick}>
                <Routes>
                  {/* UI routes */}
                  <Route path="/ui/*" element={<MainContent 
                    privacyAccepted={privacyAccepted} 
                    userIpInfo={userIpInfo} 
                    onPrivacyAcceptChange={handlePrivacyAcceptChange}
                    query={searchQuery}
                    captchaToken={captchaVerified && captchaState?.token || undefined}
                    setCaptchaToken={handleCaptchaToken}
                    phoneVerification={phoneVerification}
                    setPhoneVerification={setPhoneVerification}
                  />} />
                  
                  {/* Routes with specific file extensions */}
                  <Route path="*.{html,js,css,jpg,png}" element={<MainContent 
                    privacyAccepted={privacyAccepted} 
                    userIpInfo={userIpInfo} 
                    onPrivacyAcceptChange={handlePrivacyAcceptChange}
                    query={searchQuery}
                    captchaToken={captchaVerified && captchaState?.token || undefined}
                    setCaptchaToken={handleCaptchaToken}
                    phoneVerification={phoneVerification}
                    setPhoneVerification={setPhoneVerification}
                  />} />
                  
                  {/* All other routes show Poll component */}
                  <Route path="/*" element={
                    <Poll 
                      privacyAccepted={privacyAccepted}
                      userIpInfo={userIpInfo}
                      onPrivacyAcceptChange={handlePrivacyAcceptChange}
                      captchaToken={captchaVerified && captchaState?.token || undefined}
                      setCaptchaToken={handleCaptchaToken}
                      phoneVerification={phoneVerification}
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
    </HelmetProvider>
  )
}

export default App
