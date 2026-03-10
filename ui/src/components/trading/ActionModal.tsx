import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface ActionModalProps {
  type: 'fill-bid' | 'create-listing';
  restaurant: Restaurant;
  onClose: () => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ActionModal({ type, restaurant, onClose }: ActionModalProps) {
  const [price, setPrice] = useState(
    type === 'fill-bid'
      ? (restaurant.avgPriceCents * 0.85 / 100).toFixed(2)
      : (restaurant.avgPriceCents / 100).toFixed(2)
  );
  const [submitted, setSubmitted] = useState(false);

  const isFillBid = type === 'fill-bid';
  const title = isFillBid ? 'Fill Bid' : 'Create Listing';
  const actionLabel = isFillBid ? 'Fill Bid' : 'Create Listing';

  const handleSubmit = () => {
    setSubmitted(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="modal-body">
            <div className="modal-success">
              <div className="modal-success-icon">
                <AlertTriangle size={24} />
              </div>
              <p className="modal-success-title">Dry Run Mode</p>
              <p className="modal-success-desc">
                This action would {isFillBid ? 'fill a bid at' : 'create a listing at'}{' '}
                <strong>${price}</strong> for <strong>{restaurant.name}</strong>.
                Switch to Live mode to execute real trades.
              </p>
              <button className="modal-btn primary" onClick={onClose}>Got It</button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="modal-restaurant">
              <div className="modal-restaurant-logo" style={{ background: restaurant.color }}>
                {restaurant.name.charAt(0)}
              </div>
              <div>
                <div className="modal-restaurant-name">{restaurant.name}</div>
                <div className="modal-restaurant-meta">{restaurant.city} · {restaurant.cuisineType}</div>
              </div>
            </div>

            <div className="modal-field">
              <label>Current Avg Price</label>
              <span className="modal-field-value">{formatPrice(restaurant.avgPriceCents)}</span>
            </div>

            <div className="modal-field">
              <label>{isFillBid ? 'Bid Price' : 'Listing Price'}</label>
              <div className="modal-price-input">
                <span className="modal-price-prefix">$</span>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button
                className={`modal-btn ${isFillBid ? 'danger' : 'primary'}`}
                onClick={handleSubmit}
              >
                {actionLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
