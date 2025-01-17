import { useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import Poll from './components/Poll'
import './App.css'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

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

  return (
    <BrowserRouter>
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <div className="app-container">
          <Header 
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
          />
          <div className="main-content">
            <Sidebar isOpen={isSidebarOpen} />
            <Routes>
              {/* UI routes */}
              <Route path="/ui/*" element={<MainContent />} />
              
              {/* Routes with dots (e.g., file extensions) */}
              <Route path="*.*" element={<MainContent />} />
              
              {/* All other routes show Poll component */}
              <Route path="/*" element={<Poll />} />
            </Routes>
          </div>
        </div>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
