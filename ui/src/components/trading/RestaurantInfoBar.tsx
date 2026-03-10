import { TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface RestaurantInfoBarProps {
  restaurant: Restaurant;
  activeIndicators: Set<string>;
  onToggleIndicator: (id: string) => void;
  onFillBid: () => void;
  onCreateListing: () => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function RestaurantInfoBar({
  restaurant,
  activeIndicators,
  onToggleIndicator,
  onFillBid,
  onCreateListing,
}: RestaurantInfoBarProps) {
  const initial = restaurant.name.charAt(0).toUpperCase();

  return (
    <div className="restaurant-info-bar">
      <div className="restaurant-info-left">
        <div className="restaurant-logo" style={{ background: restaurant.color }}>
          {initial}
        </div>
        <div className="restaurant-details">
          <h3>{restaurant.name}</h3>
          <span>{restaurant.city} · {restaurant.cuisineType}</span>
        </div>
      </div>

      <div className="restaurant-price-info">
        <span className="restaurant-current-price">{formatPrice(restaurant.avgPriceCents)}</span>
        <span className={`restaurant-price-change ${restaurant.changePct >= 0 ? 'positive' : 'negative'}`}>
          {restaurant.changePct >= 0 ? '+' : ''}{restaurant.changePct.toFixed(1)}%
        </span>
      </div>

      <div className="restaurant-indicators">
        <button
          className={`indicator-chip${activeIndicators.has('sma') ? ' active' : ''}`}
          onClick={() => onToggleIndicator('sma')}
        >
          <TrendingUp size={12} />
          SMA (20)
        </button>
        <button
          className={`indicator-chip${activeIndicators.has('conversion') ? ' active' : ''}`}
          onClick={() => onToggleIndicator('conversion')}
        >
          <DollarSign size={12} />
          Conversion
        </button>
        <button
          className={`indicator-chip${activeIndicators.has('demand') ? ' active' : ''}`}
          onClick={() => onToggleIndicator('demand')}
        >
          <BarChart3 size={12} />
          Demand
        </button>
      </div>

      <div className="restaurant-actions">
        <button className="btn-fill-bid" onClick={onFillBid}>Fill Bid</button>
        <button className="btn-create-listing" onClick={onCreateListing}>Create Listing</button>
      </div>
    </div>
  );
}
