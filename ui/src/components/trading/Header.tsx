import { Search } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface HeaderProps {
  tickerRestaurants: Restaurant[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function Header({ tickerRestaurants, searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        AT Edge
        <span>reservation market intelligence</span>
      </div>

      <div className="header-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search restaurants..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      <div className="header-ticker">
        {tickerRestaurants.map(r => (
          <div key={r.alias} className="ticker-item">
            <span className="ticker-symbol">{r.name}</span>
            <span className="ticker-price">{formatPrice(r.avgPriceCents)}</span>
            <span className={`ticker-change ${r.changePct >= 0 ? 'positive' : 'negative'}`}>
              {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="header-right">
        <div className="header-portfolio">
          <span className="header-portfolio-label">Portfolio</span>
          <span className="header-portfolio-value">$2,450.00</span>
          <span className="header-portfolio-change">+$180.00 (+7.9%)</span>
        </div>

        <div className="header-portfolio" style={{ marginLeft: 8 }}>
          <span className="header-portfolio-label">Balance</span>
          <span className="header-portfolio-value" style={{ fontSize: 'var(--text-sm)' }}>$1,200.00</span>
        </div>

        <span className="header-mode-badge dry-run">Dry Run</span>
      </div>
    </header>
  );
}
