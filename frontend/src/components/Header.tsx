import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography } from '@mui/material';
import { useState, useEffect } from 'react';
import PersonIcon from '@mui/icons-material/Person';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { PhoneVerificationState } from '../App';

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  phoneVerification: PhoneVerificationState | null;
}

function Header({ isSidebarOpen, setIsSidebarOpen, onSearchChange, phoneVerification }: HeaderProps) {
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
      if (inputValue) {
        navigate(`/ui/popular?q=${encodeURIComponent(inputValue)}`);
      } else {
        navigate('/ui/popular');
      }
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
          style={{ height: '32px', marginRight: '12px', cursor: 'pointer' }}
          onClick={() => navigate('/ui/popular')}
        />
        <Typography
          variant="h6"
          component="div"
          className="site-title"
          sx={{
            cursor: 'pointer',
            mr: 2,
            fontWeight: 700,
            fontSize: '1.25rem',
            color: '#1A2B3C',
            transition: 'color 0.2s',
            '&:hover': { color: '#2D7DC5' }
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
          onChange={(e) => {
            setInputValue(e.target.value)
            if (e.target.value === '') {
              onSearchChange('')
              navigate('/ui/popular');
            }
          }}
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
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#F0F6FC',
          border: '1px solid #C8DDEF',
          marginLeft: '16px',
          position: 'relative',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#D6EBFA';
          e.currentTarget.style.borderColor = '#2D7DC5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F0F6FC';
          e.currentTarget.style.borderColor = '#C8DDEF';
        }}
      >
        <PersonIcon sx={{ color: '#4A6480' }} />
        {phoneVerification && (
          <CheckCircleIcon
            sx={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              color: '#22C55E',
              backgroundColor: '#FFFFFF',
              borderRadius: '50%',
              fontSize: '16px',
              border: '2px solid #FFFFFF'
            }}
          />
        )}
      </div>
    </header>
  )
}

export default Header 