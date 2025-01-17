import { useNavigate } from 'react-router-dom';
import { Typography } from '@mui/material';

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}

function Header({ isSidebarOpen, setIsSidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  
  return (
    <header className="header">
      <button 
        className="burger-menu"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        ☰
      </button>
      <Typography 
        variant="h6" 
        component="div" 
        className="site-title"
        sx={{ 
          cursor: 'pointer', 
          mr: 2,
          fontWeight: 'bold',
          '&:hover': { color: 'primary.main' }
        }}
        onClick={() => navigate('/')}
      >
        ip-vote.com
      </Typography>
      <div className="search-container">
        <input 
          type="search" 
          placeholder="Search..."
          className="search-bar"
        />
      </div>
      <button className="create-button desktop-only" onClick={() => navigate('/ui/create')}>
        Create Poll
      </button>
    </header>
  )
}

export default Header 