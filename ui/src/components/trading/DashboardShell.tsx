import { useState, useCallback, useEffect, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { RestaurantInfoBar } from './RestaurantInfoBar';
import { PriceChart } from './PriceChart';
import { RestaurantTabs } from './RestaurantTabs';
import { WatchlistPanel } from './WatchlistPanel';
import { AlertsPanel } from './AlertsPanel';
import { RestaurantDetailCard } from './RestaurantDetailCard';
import { ActionModal } from './ActionModal';
import { RestaurantProfileModal } from './RestaurantProfileModal';

export interface Restaurant {
  alias: string;
  name: string;
  city: string;
  cuisineType: string;
  avgPriceCents: number;
  changePct: number;
  color: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

// Fallback restaurants — used when both API calls fail
const FALLBACK_RESTAURANTS: Restaurant[] = [
  { alias: 'carbone-new-york', name: 'Carbone', city: 'New York', cuisineType: 'Italian', avgPriceCents: 35000, changePct: 4.2, color: '#C53030' },
  { alias: 'french-laundry-yountville', name: 'French Laundry', city: 'Yountville', cuisineType: 'French', avgPriceCents: 85000, changePct: -1.8, color: '#2B6CB0' },
  { alias: 'nobu-malibu', name: 'Nobu Malibu', city: 'Malibu', cuisineType: 'Japanese', avgPriceCents: 28000, changePct: 2.1, color: '#2D3748' },
  { alias: 'le-bernardin-new-york', name: 'Le Bernardin', city: 'New York', cuisineType: 'French', avgPriceCents: 42000, changePct: 0.5, color: '#553C9A' },
  { alias: 'don-angie-new-york', name: "Don Angie", city: 'New York', cuisineType: 'Italian', avgPriceCents: 18500, changePct: 8.3, color: '#D69E2E' },
];

// Extract city from restaurant name or alias
// AT names often include city: "Aba Austin", "Nightingale Vancouver"
// AT aliases encode it too: "carbone-new-york", "nobu-malibu"
function extractCity(name: string, alias: string): string {
  // Known city names to match against (multi-word cities first)
  const knownCities = [
    'New York', 'Los Angeles', 'San Francisco', 'San Diego', 'Las Vegas',
    'Ciudad De Mxico', 'Beverly Hills', 'Newport Beach',
    'Austin', 'Dallas', 'Houston', 'Washington', 'Chicago', 'Miami',
    'Malibu', 'Yountville', 'Napa', 'Denver', 'Seattle', 'Portland',
    'Boston', 'Atlanta', 'Nashville', 'Philadelphia', 'Lakewood',
    'Anaheim', 'Vancouver', 'Toronto', 'Noord', 'Scottsdale',
    'Providence', 'Clayton', 'Seoul', 'Osaka',
  ];

  // Check if the name ends with a known city
  const nameLower = name.toLowerCase();
  for (const city of knownCities) {
    if (nameLower.endsWith(city.toLowerCase())) {
      return city;
    }
  }

  // Check alias for known city patterns
  const aliasLower = alias.toLowerCase();
  for (const city of knownCities) {
    const citySlug = city.toLowerCase().replace(/\s+/g, '-');
    if (aliasLower.endsWith(citySlug) || aliasLower.includes('-' + citySlug)) {
      return city;
    }
  }

  // No city found — return empty (don't guess)
  return '';
}

// Deterministic color from alias string (same hash pattern as PriceChart's seeded random)
function colorFromAlias(alias: string): string {
  let h = 0;
  for (let i = 0; i < alias.length; i++) {
    h = ((h << 5) - h + alias.charCodeAt(i)) | 0;
  }
  h = Math.abs(h);
  const hue = h % 360;
  const sat = 40 + (h % 30);    // 40–70%
  const lit = 35 + (h % 20);    // 35–55%
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

interface ChartLocation {
  alias: string;
  tradeCount: number;
  firstTrade: string;
  lastTrade: string;
}

interface MemoryLocation {
  alias: string;
  name: string;
  city?: string | null;
  cuisine_type?: string | null;
}

export function DashboardShell() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(FALLBACK_RESTAURANTS);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant>(FALLBACK_RESTAURANTS[0]);
  const [recentRestaurants, setRecentRestaurants] = useState<Restaurant[]>([FALLBACK_RESTAURANTS[0]]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['sma']));
  const [showVolume, setShowVolume] = useState(true);
  const [actionModal, setActionModal] = useState<{ type: 'fill-bid' | 'create-listing'; restaurant: Restaurant } | null>(null);
  const [profileModal, setProfileModal] = useState<Restaurant | null>(null);

  // Watchlist state backed by localStorage
  const [watchlistAliases, setWatchlistAliases] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('at-edge-watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('at-edge-watchlist', JSON.stringify(watchlistAliases));
  }, [watchlistAliases]);

  // Derive watchlist restaurants from the full list
  const watchlistRestaurants = useMemo(
    () => watchlistAliases
      .map(alias => restaurants.find(r => r.alias === alias))
      .filter((r): r is Restaurant => r !== undefined),
    [watchlistAliases, restaurants]
  );

  // Fetch restaurants from live API on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchRestaurants() {
      try {
        const [chartRes, memoryRes] = await Promise.allSettled([
          fetch(`${API_BASE}/chart-data/`).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
          fetch(`${API_BASE}/memory/locations`).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        ]);

        if (cancelled) return;

        // If both failed, stick with fallback
        if (chartRes.status === 'rejected' && memoryRes.status === 'rejected') {
          setLoading(false);
          return;
        }

        const chartLocations: ChartLocation[] =
          chartRes.status === 'fulfilled' ? (chartRes.value.locations ?? []) : [];
        const memoryLocations: MemoryLocation[] =
          memoryRes.status === 'fulfilled' ? (memoryRes.value.locations ?? []) : [];

        // Build a lookup map from memory locations by alias
        const memoryMap = new Map<string, MemoryLocation>();
        for (const loc of memoryLocations) {
          memoryMap.set(loc.alias, loc);
        }

        // Use chart-data locations as the primary source (they have trade data)
        // Fall back to memory locations if chart-data is empty
        const sourceAliases = chartLocations.length > 0
          ? chartLocations.map(cl => cl.alias)
          : memoryLocations.map(ml => ml.alias);

        if (sourceAliases.length === 0) {
          setLoading(false);
          return;
        }

        // Build a map from chart locations for avgPrice lookup
        const chartMap = new Map<string, ChartLocation>();
        for (const cl of chartLocations) {
          chartMap.set(cl.alias, cl);
        }

        const merged: Restaurant[] = sourceAliases.map(alias => {
          const mem = memoryMap.get(alias);
          const chart = chartMap.get(alias);

          // Derive a readable name from alias if memory data is missing
          const name = mem?.name ?? alias
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          return {
            alias,
            name,
            city: mem?.city || extractCity(name, alias),
            cuisineType: mem?.cuisine_type ?? 'Restaurant',
            avgPriceCents: chart ? 10000 : 10000, // default; will be refined below
            changePct: 0,
            color: colorFromAlias(alias),
          };
        });

        // Fetch last close price for top restaurants (up to 20 to avoid too many requests)
        const topAliases = merged.slice(0, 20);
        const priceResults = await Promise.allSettled(
          topAliases.map(r =>
            fetch(`${API_BASE}/chart-data/${r.alias}?tf=1M`)
              .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
          )
        );

        if (cancelled) return;

        for (let i = 0; i < topAliases.length; i++) {
          const result = priceResults[i];
          if (result.status === 'fulfilled' && result.value.candles?.length > 0) {
            const candles = result.value.candles;
            const lastClose = candles[candles.length - 1].close;
            merged[i].avgPriceCents = Math.round(lastClose * 100);
          }
        }

        setRestaurants(merged);
        setSelectedRestaurant(merged[0]);
        setRecentRestaurants([merged[0]]);

        // Seed watchlist with top 5 if empty
        setWatchlistAliases(prev => {
          if (prev.length === 0) {
            return merged.slice(0, 5).map(r => r.alias);
          }
          return prev;
        });
      } catch {
        // On unexpected error, keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRestaurants();
    return () => { cancelled = true; };
  }, []);

  const handleSelectRestaurant = useCallback((restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setRecentRestaurants(prev => {
      const filtered = prev.filter(r => r.alias !== restaurant.alias);
      return [restaurant, ...filtered].slice(0, 6);
    });
  }, []);

  const addToWatchlist = useCallback((restaurant: Restaurant) => {
    setWatchlistAliases(prev =>
      prev.includes(restaurant.alias) ? prev : [...prev, restaurant.alias]
    );
  }, []);

  const removeFromWatchlist = useCallback((alias: string) => {
    setWatchlistAliases(prev => prev.filter(a => a !== alias));
  }, []);

  const toggleIndicator = useCallback((id: string) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ color: '#a1a1aa', fontSize: '14px', fontFamily: 'monospace' }}>Loading market data...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Sidebar />
      <Header
        tickerRestaurants={restaurants.slice(0, 3)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <main className="main-content">
        <RestaurantInfoBar
          restaurant={selectedRestaurant}
          activeIndicators={activeIndicators}
          onToggleIndicator={toggleIndicator}
          onFillBid={() => setActionModal({ type: 'fill-bid', restaurant: selectedRestaurant })}
          onCreateListing={() => setActionModal({ type: 'create-listing', restaurant: selectedRestaurant })}
        />
        <PriceChart
          restaurant={selectedRestaurant}
          activeIndicators={activeIndicators}
          showVolume={showVolume}
        />
        <RestaurantTabs
          restaurants={recentRestaurants}
          activeAlias={selectedRestaurant.alias}
          onSelect={handleSelectRestaurant}
          showVolume={showVolume}
          onToggleVolume={() => setShowVolume(v => !v)}
          allRestaurants={restaurants}
          onAddRestaurant={handleSelectRestaurant}
        />
      </main>
      <aside className="right-panel">
        <div onClick={() => setProfileModal(selectedRestaurant)} style={{ cursor: 'pointer' }}>
          <RestaurantDetailCard restaurant={selectedRestaurant} />
        </div>
        <WatchlistPanel
          restaurants={watchlistRestaurants}
          allRestaurants={restaurants}
          onSelect={handleSelectRestaurant}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
          searchQuery={searchQuery}
        />
        <AlertsPanel />
      </aside>

      {actionModal && (
        <ActionModal
          type={actionModal.type}
          restaurant={actionModal.restaurant}
          onClose={() => setActionModal(null)}
        />
      )}

      {profileModal && (
        <RestaurantProfileModal
          restaurant={profileModal}
          onClose={() => setProfileModal(null)}
        />
      )}
    </div>
  );
}
