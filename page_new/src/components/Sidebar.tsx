import { useNavigate } from 'react-router-dom';

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
        <li><a href="/ui/popular">Popular polls</a></li>
        <li><a href="/ui/newsletter">Newsletter</a></li>
      </ul>
    </div>
  )
}

export default Sidebar 