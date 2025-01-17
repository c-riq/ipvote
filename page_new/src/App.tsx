import { useState } from 'react'
import './App.css'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <button 
          className="burger-menu"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          ☰
        </button>
        <div className="search-container">
          <input 
            type="search" 
            placeholder="Search..."
            className="search-bar"
          />
        </div>
        <button className="create-button">Create Poll</button>
      </header>

      <div className="main-content">
        {/* Sidebar */}
        <nav className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/ui/popular">Popular</a></li>
            <li><a href="/ui/all">All</a></li>
          </ul>
        </nav>

        {/* Main Content Area */}
        <main className="content">
          <h1>Polls</h1>
        </main>
      </div>
    </div>
  )
}

export default App
