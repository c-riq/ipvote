interface SidebarProps {
  isOpen: boolean;
}

function Sidebar({ isOpen }: SidebarProps) {
  return (
    <nav className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <ul>
        <li><a href="/ui/popular">Popular polls</a></li>
        <li><a href="/ui/newsletter">Newsletter</a></li>
      </ul>
    </nav>
  )
}

export default Sidebar 