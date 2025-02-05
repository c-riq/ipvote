import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography } from '@mui/material';
import { useState, useEffect } from 'react';
import PersonIcon from '@mui/icons-material/Person';

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function Header({ isSidebarOpen, setIsSidebarOpen, onSearchChange }: HeaderProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(() => searchParams.get('q') || '');
  
  // Run once on mount to handle initial URL params
  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setInputValue(query);
      onSearchChange(query);
      navigate(`/ui/popular?q=${encodeURIComponent(query)}`, { replace: true });
    }
  }, []); // Empty dependency array for mount-only
  
  // Handle subsequent URL param changes
  useEffect(() => {
    const query = searchParams.get('q') || '';
    setInputValue(query);
    onSearchChange(query);
  }, [searchParams]);
  
  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchChange(inputValue);
      navigate(`/ui/popular?q=${encodeURIComponent(inputValue)}`);
    }
  }
  
  return (
    <header className="header">
      <button 
        className="burger-menu"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        ☰
      </button>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img 
          src="/img/logo.png" 
          alt="IP Vote Logo" 
          style={{ height: '24px', marginRight: '8px', cursor: 'pointer' }}
          onClick={() => navigate('/ui/popular')}
        />
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
      </div>
      <div className="search-container">
        <input 
          type="search" 
          placeholder="Search..."
          className="search-bar"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleSearchSubmit}
          style={{
            fontSize: '16px',
            height: '40px',
            width: '100%',
            padding: '0 12px'
          }}
        />
      </div>
      <button className="create-button desktop-only" onClick={() => navigate('/ui/create')}>
        Create Poll
      </button>
      <div 
        onClick={() => navigate('/ui/identity')}
        style={{ 
          cursor: 'pointer',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          marginLeft: '12px'
        }}
      >
        <PersonIcon />
      </div>
    </header>
  )
}

export default Header 