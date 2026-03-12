import { useState, useEffect, useCallback } from 'react';
import { X, LayoutDashboard, BarChart3, ArrowLeftRight, Info, MapPin, Building2, Star, ExternalLink, Sparkles, RefreshCw, Phone, Globe } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface RestaurantProfileModalProps {
  restaurant: Restaurant;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

type TabId = 'overview' | 'market' | 'trades' | 'about';

interface EnrichedProfile {
  locationAlias: string;
  restaurantName: string;
  cuisineType: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  photoUrls: string[];
  highlights: string[];
  aiAnalysis: string | null;
  scrapedData: Record<string, unknown>;
  enrichedAt: string;
  tradingContext?: {
    tradeCount: number;
    avgPriceCents: number;
    recentTrades: Array<{ date: string; priceCents: number }>;
  };
}

interface MetricsData {
  LowPrice?: string;
  HighPrice?: string;
  AveragePrice?: string;
  TransactionCount?: string;
  ActiveBids?: string;
  PageVisitors?: string;
  [key: string]: string | undefined;
}

interface TradeData {
  date: string;
  price: string;
  inventoryType?: string;
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function formatTradeDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function renderMarkdown(text: string): string {
  // Simple markdown-to-HTML for the AI analysis
  return text
    .replace(/## (.+)/g, '<h3 class="profile-ai-heading">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n- (.+)/g, '\n<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export function RestaurantProfileModal({ restaurant, onClose }: RestaurantProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [profile, setProfile] = useState<EnrichedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  const initial = restaurant.name.charAt(0).toUpperCase();
  const baseColor = restaurant.color;

  // Fetch enriched profile on mount
  const fetchProfile = useCallback((refresh = false) => {
    setProfileLoading(true);
    setProfileError(null);
    const url = `${API_BASE}/restaurant/${restaurant.alias}/profile${refresh ? '?refresh=true' : ''}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        setProfile(data.profile);
      })
      .catch(err => {
        console.warn('Profile enrichment failed:', err);
        setProfileError(String(err));
      })
      .finally(() => setProfileLoading(false));
  }, [restaurant.alias]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Fetch metrics when Market Data tab is selected
  useEffect(() => {
    if (activeTab === 'market' && !metrics && !metricsLoading) {
      setMetricsLoading(true);
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      fetch(`${API_BASE}/location/${restaurant.alias}/metrics?start=${fmt(start)}&end=${fmt(now)}`)
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(data => {
          const kvList = data?.Payload?.ResponseBody?.KeyValueList ?? data?.Payload ?? [];
          const parsed: MetricsData = {};
          if (Array.isArray(kvList)) {
            for (const item of kvList) {
              if (item.Key && item.Value !== undefined) {
                parsed[item.Key] = String(item.Value);
              }
            }
          }
          setMetrics(parsed);
        })
        .catch(() => setMetrics({}))
        .finally(() => setMetricsLoading(false));
    }
  }, [activeTab, metrics, metricsLoading, restaurant.alias]);

  // Fetch trades when Trades tab is selected
  useEffect(() => {
    if (activeTab === 'trades' && trades.length === 0 && !tradesLoading) {
      setTradesLoading(true);
      fetch(`${API_BASE}/chart-data/${restaurant.alias}?tf=1D`)
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(data => {
          const candles = data?.candles ?? [];
          const mapped = candles.slice(-20).reverse().map((c: any) => ({
            date: formatTradeDate(c.time),
            price: `$${c.close?.toFixed(2) ?? '—'}`,
            inventoryType: c.volume ? `${c.volume} trades` : undefined,
          }));
          setTrades(mapped);
        })
        .catch(() => setTrades([]))
        .finally(() => setTradesLoading(false));
    }
  }, [activeTab, trades.length, tradesLoading, restaurant.alias]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'market', label: 'Market Data', icon: BarChart3 },
    { id: 'trades', label: 'Trades', icon: ArrowLeftRight },
    { id: 'about', label: 'AI Analysis', icon: Sparkles },
  ];

  const displayRating = profile?.rating ?? null;
  const displayReviewCount = profile?.reviewCount ?? null;
  const displayPriceLevel = profile?.priceLevel ?? null;
  const displayCuisine = profile?.cuisineType ?? restaurant.cuisineType;
  const displayHighlights = profile?.highlights ?? [];
  const tradingCtx = profile?.tradingContext;

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        {/* Banner */}
        <div className="profile-modal-banner">
          <div className="profile-modal-banner-gradient" style={{ background: `linear-gradient(135deg, ${baseColor}, ${baseColor}44)` }} />
          <button className="profile-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="profile-modal-profile">
          <div className="profile-modal-avatar">
            <div className="profile-modal-avatar-inner" style={{ background: baseColor }}>
              {initial}
            </div>
          </div>
        </div>

        {/* Name & Meta */}
        <div className="profile-modal-info">
          <div className="profile-modal-name">
            <h2>{restaurant.name}</h2>
          </div>
          <div className="profile-modal-meta">
            <div className="profile-modal-meta-item">
              <MapPin size={14} />
              <span>{restaurant.city || 'Unknown'}</span>
            </div>
            {displayRating && (
              <>
                <span className="profile-modal-meta-sep">|</span>
                <div className="profile-modal-meta-item">
                  <Star size={14} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                  <span>{displayRating.toFixed(1)}{displayReviewCount ? ` (${displayReviewCount.toLocaleString()} reviews)` : ''}</span>
                </div>
              </>
            )}
            {displayPriceLevel && (
              <>
                <span className="profile-modal-meta-sep">|</span>
                <div className="profile-modal-meta-item">
                  <span style={{ color: 'var(--color-success)' }}>{displayPriceLevel}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="profile-modal-tags">
          <span className="profile-modal-tag">{displayCuisine}</span>
          {displayHighlights.map((h, i) => (
            <span key={i} className="profile-modal-tag profile-modal-tag-highlight">{h}</span>
          ))}
          <span className="profile-modal-tag">Reservation Trading</span>
        </div>

        {/* Tabs */}
        <div className="profile-modal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`profile-modal-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="profile-modal-body">
          {activeTab === 'overview' && (
            <div>
              {/* KPI Grid — show enriched data */}
              <div className="profile-modal-kpi-grid">
                <div className="profile-modal-kpi">
                  <div className="profile-modal-kpi-label">Avg Trade Price</div>
                  <div className="profile-modal-kpi-value">
                    {tradingCtx?.avgPriceCents
                      ? formatCents(tradingCtx.avgPriceCents)
                      : formatCents(restaurant.avgPriceCents)}
                  </div>
                </div>
                <div className="profile-modal-kpi">
                  <div className="profile-modal-kpi-label">Total Trades</div>
                  <div className="profile-modal-kpi-value">
                    {tradingCtx?.tradeCount?.toLocaleString() ?? '—'}
                  </div>
                </div>
                <div className="profile-modal-kpi">
                  <div className="profile-modal-kpi-label">Rating</div>
                  <div className="profile-modal-kpi-value">
                    {displayRating ? `${displayRating.toFixed(1)} / 5` : '—'}
                  </div>
                </div>
                <div className="profile-modal-kpi">
                  <div className="profile-modal-kpi-label">Price Level</div>
                  <div className="profile-modal-kpi-value">{displayPriceLevel ?? '—'}</div>
                </div>
              </div>

              {/* Contact Info (if available) */}
              {(profile?.phone || profile?.website || profile?.address) && (
                <>
                  <div className="profile-modal-section-title">Contact</div>
                  <div className="profile-modal-info-rows">
                    {profile.address && (
                      <div className="profile-modal-info-row">
                        <span className="info-label"><MapPin size={12} style={{ marginRight: 4 }} />Address</span>
                        <span className="info-value">{profile.address}</span>
                      </div>
                    )}
                    {profile.phone && (
                      <div className="profile-modal-info-row">
                        <span className="info-label"><Phone size={12} style={{ marginRight: 4 }} />Phone</span>
                        <span className="info-value">{profile.phone}</span>
                      </div>
                    )}
                    {profile.website && (
                      <div className="profile-modal-info-row">
                        <span className="info-label"><Globe size={12} style={{ marginRight: 4 }} />Website</span>
                        <span className="info-value">
                          <a href={profile.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                            {profile.website.replace(/^https?:\/\//, '').substring(0, 40)}
                            <ExternalLink size={10} style={{ marginLeft: 4 }} />
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Recent Trades */}
              {tradingCtx && tradingCtx.recentTrades.length > 0 && (
                <>
                  <div className="profile-modal-section-title">Recent Trades</div>
                  <div className="profile-modal-info-rows">
                    {tradingCtx.recentTrades.slice(0, 5).map((t, i) => (
                      <div key={i} className="profile-modal-info-row">
                        <span className="info-label">{formatTradeDate(t.date)}</span>
                        <span className="info-value">{formatCents(t.priceCents)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Loading indicator */}
              {profileLoading && (
                <div className="profile-modal-loading">
                  <Sparkles size={14} style={{ marginRight: 6, animation: 'pulse 1.5s infinite' }} />
                  Enriching profile with Apify + Claude...
                </div>
              )}
            </div>
          )}

          {activeTab === 'market' && (
            <div>
              <div className="profile-modal-section-title">90-Day AT Metrics</div>
              {metricsLoading ? (
                <div className="profile-modal-loading">Fetching metrics from AT API...</div>
              ) : metrics && Object.keys(metrics).length > 0 ? (
                <div className="profile-modal-info-rows">
                  {metrics.LowPrice && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">Low Price</span>
                      <span className="info-value">${(parseInt(metrics.LowPrice) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {metrics.HighPrice && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">High Price</span>
                      <span className="info-value">${(parseInt(metrics.HighPrice) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {metrics.AveragePrice && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">Avg Price</span>
                      <span className="info-value">${(parseInt(metrics.AveragePrice) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {metrics.TransactionCount && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">Transactions</span>
                      <span className="info-value">{metrics.TransactionCount}</span>
                    </div>
                  )}
                  {metrics.ActiveBids && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">Active Bids</span>
                      <span className="info-value">{metrics.ActiveBids}</span>
                    </div>
                  )}
                  {metrics.PageVisitors && (
                    <div className="profile-modal-info-row">
                      <span className="info-label">Page Visitors</span>
                      <span className="info-value">{metrics.PageVisitors}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="profile-modal-loading">No metrics available for this location</div>
              )}
            </div>
          )}

          {activeTab === 'trades' && (
            <div>
              <div className="profile-modal-section-title">Trade History (from Neon)</div>
              {tradesLoading ? (
                <div className="profile-modal-loading">Fetching trades...</div>
              ) : trades.length > 0 ? (
                <div className="profile-modal-info-rows">
                  {trades.map((t, i) => (
                    <div key={i} className="profile-modal-info-row">
                      <span className="info-label">{t.date}</span>
                      <span className="info-value">
                        {t.price}
                        {t.inventoryType && <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: '11px' }}>{t.inventoryType}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-modal-loading">No trade data available</div>
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div>
              {profileLoading ? (
                <div className="profile-modal-loading">
                  <Sparkles size={14} style={{ marginRight: 6, animation: 'pulse 1.5s infinite' }} />
                  Generating AI analysis with Claude...
                </div>
              ) : profile?.aiAnalysis ? (
                <div className="profile-ai-analysis">
                  <div className="profile-ai-badge">
                    <Sparkles size={12} />
                    <span>Claude AI Analysis</span>
                    {profile.enrichedAt && (
                      <span className="profile-ai-date">
                        {formatTradeDate(profile.enrichedAt)}
                      </span>
                    )}
                  </div>
                  <div
                    className="profile-ai-content"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(profile.aiAnalysis) }}
                  />
                </div>
              ) : profileError ? (
                <div className="profile-modal-desc-text" style={{ color: 'var(--color-warning)' }}>
                  Could not generate AI analysis. Ensure the server is running and ANTHROPIC_API_KEY is set.
                  {!profile && <><br/><br/>Set APIFY_API_TOKEN in your .env for web-enriched analysis.</>}
                </div>
              ) : (
                <div className="profile-modal-desc-text">
                  No AI analysis available yet. Click refresh to generate one.
                </div>
              )}

              {/* Details section */}
              <div className="profile-modal-section-title" style={{ marginTop: 16 }}>Details</div>
              <div className="profile-modal-info-rows">
                <div className="profile-modal-info-row">
                  <span className="info-label">AT Alias</span>
                  <span className="info-value">{restaurant.alias}</span>
                </div>
                <div className="profile-modal-info-row">
                  <span className="info-label">City</span>
                  <span className="info-value">{restaurant.city || '—'}</span>
                </div>
                <div className="profile-modal-info-row">
                  <span className="info-label">Cuisine</span>
                  <span className="info-value">{displayCuisine}</span>
                </div>
                <div className="profile-modal-info-row">
                  <span className="info-label">Avg Trade Price</span>
                  <span className="info-value">{formatCents(restaurant.avgPriceCents)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="profile-modal-footer">
          <button className="profile-modal-btn profile-modal-btn-secondary" onClick={onClose}>Close</button>
          <button
            className="profile-modal-btn profile-modal-btn-secondary"
            onClick={() => fetchProfile(true)}
            disabled={profileLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={14} className={profileLoading ? 'spinning' : ''} />
            Refresh
          </button>
          <button className="profile-modal-btn profile-modal-btn-primary" onClick={onClose}>View Chart</button>
        </div>
      </div>
    </div>
  );
}
