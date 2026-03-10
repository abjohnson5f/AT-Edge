import { useNavigate, useLocation } from 'react-router';
import {
  LayoutDashboard,
  CandlestickChart,
  Briefcase,
  Star,
  Bell,
  FileText,
  Mail,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { id: 'charts', icon: CandlestickChart, label: 'Charts', path: '/' },
  { id: 'portfolio', icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
  { id: 'watchlist', icon: Star, label: 'Watchlists', path: '/' },
  { id: 'alerts', icon: Bell, label: 'Alerts', path: '/' },
  { id: 'scout', icon: FileText, label: 'Scout', path: '/scout' },
  { id: 'import', icon: Mail, label: 'Import', path: '/import' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="14" fill="#547C81" />
          <path
            d="M10 10h5v5h-5zM17 10h5v5h-5zM10 17h5v5h-5zM17 17h5v5h-5z"
            fill="white"
            fillOpacity="0.9"
          />
        </svg>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const isActive = item.path === '/'
            ? location.pathname === '/' && item.id === 'dashboard'
            : location.pathname === item.path;

          return (
            <button
              key={item.id}
              className={`sidebar-nav-item${isActive ? ' active' : ''}`}
              aria-label={item.label}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={20} />
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button className="sidebar-nav-item" aria-label="Settings">
          <Settings size={20} />
        </button>
        <div className="sidebar-avatar">AJ</div>
      </div>
    </aside>
  );
}
