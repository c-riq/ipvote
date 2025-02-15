import { useNavigate } from 'react-router-dom';
import TrendingUp from '@mui/icons-material/Home';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VerifiedIcon from '@mui/icons-material/Verified';
import Lightbulb from '@mui/icons-material/Lightbulb';
import PublicIcon from '@mui/icons-material/Public';
import GitHubIcon from '@mui/icons-material/GitHub';
import XIcon from '@mui/icons-material/X';
import Forward from '@mui/icons-material/Forward';
import HowToReg from '@mui/icons-material/HowToReg';

interface SidebarProps {
  isOpen: boolean;
}

function Sidebar({ isOpen }: SidebarProps) {
  const navigate = useNavigate();
  
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="mobile-only" style={{ marginBottom: '1rem' }}>
        <button 
          className="create-button" 
          onClick={() => navigate('/ui/create')}
          style={{ width: '100%' }}
        >
          Create Poll
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ul>
          <li>
            <a href="/ui/popular" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp sx={{ fontSize: 20 }} />
              Popular polls
            </a>
          </li>
          <li>
            <a href="/ui/identity" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <VerifiedIcon sx={{ fontSize: 20 }} />
              My identity
            </a>
          </li>
          <li>
            <a href="/ui/delegate" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Forward sx={{ fontSize: 20 }} />
              Delegate voting
            </a>
          </li>
          <li>
            <a href="/ui/verify" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HowToReg sx={{ fontSize: 20 }} />
              Verify users
            </a>
          </li>
          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} />
          <li>
            <a href="/ip_based_polls_as_a_proxy_for_popular_opinion.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lightbulb sx={{ fontSize: 20 }} />
              Why IP-based polls?
            </a>
          </li>
          <li>
            <a href="/ui/geolocation" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LocationOnIcon sx={{ fontSize: 20 }} />
              Geolocation (beta)
            </a>
          </li>
          <li>
            <a href="https://globalcoordination.org/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PublicIcon sx={{ fontSize: 20 }} />
              globalcoordination.org
            </a>
          </li>
          <li>
            <a href="https://github.com/c-riq/ipvote" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitHubIcon sx={{ fontSize: 20 }} />
              GitHub Repository
            </a>
          </li>
          <li>
            <a href="https://x.com/ip_vote_com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <XIcon sx={{ fontSize: 20 }} />
              Follow on X
            </a>
          </li>
        </ul>
        <div style={{ marginTop: 'auto', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>
          <a href="/privacy_policy.html" target="_blank" rel="noopener noreferrer" style={{ marginRight: '1rem' }}>
            Privacy Policy
          </a>
          <a href="/terms_of_service.html" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  )
}

export default Sidebar 