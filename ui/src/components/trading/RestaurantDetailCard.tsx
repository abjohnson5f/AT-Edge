import { MoreHorizontal } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface RestaurantDetailCardProps {
  restaurant: Restaurant;
}

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export function RestaurantDetailCard({ restaurant }: RestaurantDetailCardProps) {
  const initial = restaurant.name.charAt(0).toUpperCase();
  const isUp = restaurant.changePct >= 0;

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span className="panel-card-title">Restaurant Detail</span>
        <div className="panel-card-actions">
          <button className="panel-action-btn" aria-label="More">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="restaurant-detail">
        <div className="restaurant-detail-header">
          <div className="restaurant-detail-logo" style={{ background: restaurant.color }}>
            {initial}
          </div>
          <div className="restaurant-detail-name">
            <h4>{restaurant.name}</h4>
            <span>{restaurant.city} · {restaurant.alias}</span>
          </div>
        </div>

        <div className="restaurant-detail-cuisine">
          {restaurant.cuisineType} · Reservation Trading
        </div>

        <div className="restaurant-detail-prices">
          <div className="restaurant-detail-price-row">
            <div>
              <span className="restaurant-detail-price-value">
                {formatPrice(restaurant.avgPriceCents)}
              </span>
              <span
                className={`restaurant-detail-price-change ${isUp ? 'positive-text' : 'negative-text'}`}
                style={{ marginLeft: 8 }}
              >
                {isUp ? '+' : ''}{restaurant.changePct.toFixed(1)}%
              </span>
            </div>
            <span className="detail-badge demand">Avg Price</span>
          </div>
          <div className="restaurant-detail-price-row">
            <div>
              <span className="restaurant-detail-price-value" style={{ fontSize: 'var(--text-sm)' }}>
                {restaurant.alias}
              </span>
              <span className="restaurant-detail-price-change" style={{ marginLeft: 8, color: 'var(--color-text-muted)' }}>
                AT Alias
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="detail-badge fill-bid">Fill</span>
              <span className="detail-badge create-listing">List</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
