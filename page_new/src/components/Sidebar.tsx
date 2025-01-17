interface SidebarProps {
  isOpen: boolean;
}

function Sidebar({ isOpen }: SidebarProps) {
  return (
    <nav className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/ui/popular">Popular</a></li>
        <li><a href="/ui/all">All</a></li>
      </ul>
    </nav>
  )
}

export default Sidebar 