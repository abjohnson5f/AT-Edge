import { Search, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Restaurant } from './DashboardShell';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface HeaderProps {
  tickerRestaurants: Restaurant[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  allRestaurants: Restaurant[];
  onSelect: (r: Restaurant) => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatUSD(dollars: number): string {
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Derive a readable name from an AT alias like "carbone-new-york" → "Carbone New York" */
function nameFromAlias(alias: string): string {
  return alias
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Deterministic color from alias string */
function colorFromAlias(alias: string): string {
  let h = 0;
  for (let i = 0; i < alias.length; i++) {
    h = ((h << 5) - h + alias.charCodeAt(i)) | 0;
  }
  h = Math.abs(h);
  return `hsl(${h % 360}, ${40 + (h % 30)}%, ${35 + (h % 20)}%)`;
}

interface ATSearchResult {
  locationAlias: string;
  city: string;
  globalATRank: string;
  locationCategoryName: string;
}

export function Header({ tickerRestaurants, searchQuery, onSearchChange, allRestaurants, onSelect }: HeaderProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [atResults, setAtResults] = useState<ATSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Local results: filter loaded restaurants instantly
  const localResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allRestaurants
      .filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.alias.toLowerCase().includes(q) ||
        r.cuisineType.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [searchQuery, allRestaurants]);

  // Debounced AT API search (300ms)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setAtResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/location/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then(r => r.json())
        .then(data => {
          const kvl = data?.Payload?.ResponseBody?.KeyValueList ?? [];
          setAtResults(kvl);
        })
        .catch(() => setAtResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Open dropdown when there's a query
  useEffect(() => {
    setDropdownOpen(searchQuery.trim().length > 0);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        onSearchChange('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSearchChange]);

  useEffect(() => {
    fetch(`${API_BASE}/account/list`)
      .then(r => r.json())
      .then(data => {
        const accounts = data?.Payload?.ResponseBody?.KeyValueList;
        if (Array.isArray(accounts)) {
          let total = 0;
          for (const acct of accounts) {
            total += Number(acct.accountAvailableCurrencyBalance ?? 0);
          }
          setBalance(total / 100);
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/config`)
      .then(r => r.json())
      .then(data => {
        if (typeof data?.dryRun === 'boolean') setDryRun(data.dryRun);
      })
      .catch(() => {});
  }, []);

  // Build a set of local aliases so we can mark AT results that we already track
  const localAliasSet = useMemo(() => new Set(allRestaurants.map(r => r.alias)), [allRestaurants]);

  // Merge AT results with local data: AT results that aren't already in localResults
  const localAliases = useMemo(() => new Set(localResults.map(r => r.alias)), [localResults]);
  const atOnlyResults = useMemo(() =>
    atResults.filter(r => !localAliases.has(r.locationAlias)).slice(0, 10),
    [atResults, localAliases]
  );

  const handleSelectAT = useCallback((result: ATSearchResult) => {
    // Check if we already have this restaurant loaded
    const existing = allRestaurants.find(r => r.alias === result.locationAlias);
    if (existing) {
      onSelect(existing);
    } else {
      // Create a new Restaurant object from the AT search result
      const restaurant: Restaurant = {
        alias: result.locationAlias,
        name: nameFromAlias(result.locationAlias),
        city: result.city || '',
        cuisineType: result.locationCategoryName || 'Restaurant',
        avgPriceCents: 0,
        changePct: 0,
        color: colorFromAlias(result.locationAlias),
      };
      onSelect(restaurant);
    }
    setDropdownOpen(false);
    onSearchChange('');
  }, [allRestaurants, onSelect, onSearchChange]);

  const hasResults = localResults.length > 0 || atOnlyResults.length > 0 || searching;

  return (
    <header className="header">
      <div className="header-brand">
        AT Edge
        <span>reservation market intelligence</span>
      </div>

      <div className="header-search" ref={searchContainerRef} style={{ position: 'relative' }}>
        <Search size={14} />
        <input
          type="text"
          placeholder="Search restaurants..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => { if (searchQuery.trim()) setDropdownOpen(true); }}
        />
        {dropdownOpen && (hasResults || searchQuery.trim().length >= 2) && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              width: 360,
              marginTop: 4,
              background: '#1a1d24',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              zIndex: 100,
              maxHeight: 480,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Local results section */}
            {localResults.length > 0 && (
              <>
                <div style={{
                  padding: '6px 12px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#71717a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  In Your Database
                </div>
                {localResults.map(r => (
                  <div
                    key={r.alias}
                    onClick={() => {
                      onSelect(r);
                      setDropdownOpen(false);
                      onSearchChange('');
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      fontSize: '13px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: '#e4e4e7', fontWeight: 500 }}>{r.name}</span>
                      <span style={{ color: '#71717a', fontSize: '11px' }}>
                        {r.city}{r.city && r.cuisineType !== 'Restaurant' ? ` · ${r.cuisineType}` : ''}
                      </span>
                    </div>
                    {r.avgPriceCents > 0 && (
                      <span style={{ color: '#a1a1aa', fontFamily: 'monospace', fontSize: '12px' }}>
                        {formatPrice(r.avgPriceCents)}
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* AT Platform results section */}
            {(atOnlyResults.length > 0 || searching) && (
              <>
                <div style={{
                  padding: '6px 12px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#71717a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  AppointmentTrader
                  {searching && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                {atOnlyResults.map(r => (
                  <div
                    key={r.locationAlias}
                    onClick={() => handleSelectAT(r)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      fontSize: '13px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: '#e4e4e7', fontWeight: 500 }}>
                        {nameFromAlias(r.locationAlias)}
                      </span>
                      <span style={{ color: '#71717a', fontSize: '11px' }}>
                        {r.city || r.locationAlias}
                        {localAliasSet.has(r.locationAlias) && (
                          <span style={{ color: '#547C81', marginLeft: 6, fontSize: '10px' }}>Tracked</span>
                        )}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      color: '#547C81',
                      border: '1px solid #547C81',
                      borderRadius: 3,
                      padding: '1px 5px',
                      whiteSpace: 'nowrap',
                    }}>
                      #{r.globalATRank} AT
                    </span>
                  </div>
                ))}
                {searching && atOnlyResults.length === 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                    Searching AppointmentTrader...
                  </div>
                )}
              </>
            )}

            {/* No results */}
            {!searching && localResults.length === 0 && atOnlyResults.length === 0 && searchQuery.trim().length >= 2 && (
              <div style={{ padding: '16px 12px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                No restaurants found for "{searchQuery}"
              </div>
            )}
          </div>
        )}
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
        <div className="header-portfolio" style={{ marginLeft: 8 }}>
          <span className="header-portfolio-label">Balance</span>
          <span className="header-portfolio-value" style={{ fontSize: 'var(--text-sm)' }}>
            {balance !== null ? (balance === 0 ? '$0' : formatUSD(balance)) : '—'}
          </span>
        </div>

        <span className={`header-mode-badge ${dryRun ? 'dry-run' : 'live'}`}>
          {dryRun ? 'DRY RUN' : 'LIVE'}
        </span>
      </div>
    </header>
  );
}
