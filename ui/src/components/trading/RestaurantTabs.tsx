import { useState, useRef, useEffect } from 'react';
import { Plus, BarChart3, X } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface RestaurantTabsProps {
  restaurants: Restaurant[];
  activeAlias: string;
  onSelect: (restaurant: Restaurant) => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  allRestaurants: Restaurant[];
  onAddRestaurant: (restaurant: Restaurant) => void;
}

export function RestaurantTabs({
  restaurants,
  activeAlias,
  onSelect,
  showVolume,
  onToggleVolume,
  allRestaurants,
  onAddRestaurant,
}: RestaurantTabsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Restaurants not already in the tab bar
  const available = allRestaurants.filter(
    r => !restaurants.some(tab => tab.alias === r.alias)
  );

  return (
    <div className="chart-bottom-bar" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3) var(--space-5)', boxShadow: 'var(--shadow-card)', position: 'relative' }}>
      <div className="chart-restaurants">
        <button
          className="add-restaurant"
          aria-label="Add restaurant"
          onClick={() => setShowPicker(!showPicker)}
        >
          <Plus size={14} />
        </button>
        {restaurants.map(r => (
          <button
            key={r.alias}
            className={`restaurant-chip${r.alias === activeAlias ? ' active' : ''}`}
            onClick={() => onSelect(r)}
          >
            <div
              className="restaurant-chip-logo"
              style={{ background: r.color }}
            >
              {r.name.charAt(0)}
            </div>
            {r.name}
          </button>
        ))}
      </div>

      <button
        className={`volume-toggle-btn${showVolume ? ' active' : ''}`}
        onClick={onToggleVolume}
      >
        <BarChart3 size={14} />
        <span>Volume</span>
      </button>

      {showPicker && available.length > 0 && (
        <div className="restaurant-picker" ref={pickerRef}>
          <div className="restaurant-picker-header">
            <span>Add Restaurant</span>
            <button className="modal-close" onClick={() => setShowPicker(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          {available.map(r => (
            <div
              key={r.alias}
              className="restaurant-picker-item"
              onClick={() => {
                onAddRestaurant(r);
                setShowPicker(false);
              }}
            >
              <div className="restaurant-chip-logo" style={{ background: r.color }}>
                {r.name.charAt(0)}
              </div>
              <span>{r.name}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', marginLeft: 'auto' }}>
                {r.city}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
