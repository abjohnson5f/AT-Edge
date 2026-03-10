import { useRef, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, MoreHorizontal, X } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface WatchlistPanelProps {
  restaurants: Restaurant[];      // the user's watchlist
  allRestaurants: Restaurant[];   // all available restaurants (for the add picker)
  onSelect: (restaurant: Restaurant) => void;
  onAdd: (restaurant: Restaurant) => void;
  onRemove: (alias: string) => void;
  searchQuery: string;
}

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export function WatchlistPanel({ restaurants, allRestaurants, onSelect, onAdd, onRemove, searchQuery }: WatchlistPanelProps) {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on click outside
  useEffect(() => {
    if (!showAddPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAddPicker(false);
        setPickerSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddPicker]);

  // Filter restaurants by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return restaurants;
    const q = searchQuery.toLowerCase();
    return restaurants.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.cuisineType.toLowerCase().includes(q) ||
        r.alias.toLowerCase().includes(q)
    );
  }, [restaurants, searchQuery]);

  // Available restaurants for the add picker (not already in watchlist)
  const availableForAdd = useMemo(() => {
    const watchAliases = new Set(restaurants.map(r => r.alias));
    let available = allRestaurants.filter(r => !watchAliases.has(r.alias));
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      available = available.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.alias.toLowerCase().includes(q)
      );
    }
    return available;
  }, [allRestaurants, restaurants, pickerSearch]);

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span className="panel-card-title">Watchlist</span>
        <div className="panel-card-actions">
          <button className="panel-action-btn" aria-label="Add" onClick={() => setShowAddPicker(!showAddPicker)}>
            <Plus size={16} />
          </button>
          <button className="panel-action-btn" aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="panel-action-btn" aria-label="Menu">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {showAddPicker && (
        <div ref={pickerRef} style={{
          borderBottom: '1px solid var(--color-border-light)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--color-surface-2)',
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          <input
            type="text"
            placeholder="Search restaurants to add..."
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            style={{
              width: '100%',
              height: 30,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 var(--space-3)',
              fontSize: 'var(--text-sm)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              marginBottom: 'var(--space-2)',
            }}
            autoFocus
          />
          {availableForAdd.slice(0, 20).map(r => (
            <div
              key={r.alias}
              onClick={() => { onAdd(r); setPickerSearch(''); setShowAddPicker(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-2)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-sm)',
              }}
              className="restaurant-picker-item"
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
          {availableForAdd.length === 0 && (
            <div style={{ padding: 'var(--space-3)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {pickerSearch ? 'No matching restaurants' : 'All restaurants added'}
            </div>
          )}
        </div>
      )}

      {restaurants.length === 0 && !showAddPicker && (
        <div style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Your watchlist is empty. Click + to add restaurants.
        </div>
      )}

      {filtered.length > 0 && (
        <table className="watchlist-table">
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Avg Price</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.alias} onClick={() => onSelect(r)}>
                <td>
                  <div className="watchlist-symbol">{r.name}</div>
                  <div className="watchlist-name">{r.city}</div>
                </td>
                <td>{formatPrice(r.avgPriceCents)}</td>
                <td style={{ width: 32, padding: '0 4px' }}>
                  <button
                    className="watchlist-remove-btn"
                    onClick={(e) => { e.stopPropagation(); onRemove(r.alias); }}
                    aria-label={`Remove ${r.name}`}
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length === 0 && restaurants.length > 0 && (
        <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          No restaurants match &quot;{searchQuery}&quot;
        </div>
      )}
    </div>
  );
}
