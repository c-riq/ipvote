import { useNavigate } from 'react-router-dom';
import TrendingUp from '@mui/icons-material/Home';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VerifiedIcon from '@mui/icons-material/Verified';
import Lightbulb from '@mui/icons-material/Lightbulb';
import PublicIcon from '@mui/icons-material/Public';
import GitHubIcon from '@mui/icons-material/GitHub';

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
      <ul>
        <li>
          <a href="/ui/popular" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp sx={{ fontSize: 20 }} />
            Popular polls
          </a>
        </li>
        <li>
          <a href="/ui/newsletter" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MailOutlineIcon sx={{ fontSize: 20 }} />
            Newsletter
          </a>
        </li>
        <li>
          <a href="/ui/identity" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VerifiedIcon sx={{ fontSize: 20 }} />
            My identity
          </a>
        </li>
        <li>
          <a href="/ui/geolocation" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LocationOnIcon sx={{ fontSize: 20 }} />
            Geolocation (beta)
          </a>
        </li>
        <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} />
        <li>
          <a href="/geolocation_via_latency.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VerifiedIcon sx={{ fontSize: 20 }} />
            Proof of location
          </a>
        </li>
        <li>
          <a href="/ip_based_polls_as_a_proxy_for_popular_opinion.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb sx={{ fontSize: 20 }} />
            Why IP-based polls?
          </a>
        </li>
        <li>
          <a href="/privacy_policy.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VerifiedIcon sx={{ fontSize: 20 }} />
            Privacy Policy
          </a>
        </li>
        <li>
          <a href="/terms_of_service.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VerifiedIcon sx={{ fontSize: 20 }} />
            Terms of Service
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
      </ul>
    </div>
  )
}

export default Sidebar 