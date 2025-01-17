import React from 'react'
import { useLocation } from 'react-router-dom'

function Poll() {
  const location = useLocation()
  
  return (
    <div className="content">
      <h1>Poll Component</h1>
      <p>Current path: {location.pathname}</p>
    </div>
  )
}

export default Poll 