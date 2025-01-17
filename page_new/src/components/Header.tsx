import { useNavigate } from 'react-router-dom';

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
      <div className="search-container">
        <input 
          type="search" 
          placeholder="Search..."
          className="search-bar"
        />
      </div>
      <button className="create-button" onClick={() => navigate('/ui/create')}>Create Poll</button>
    </header>
  )
}

export default Header 