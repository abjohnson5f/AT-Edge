import { useQuery } from "@tanstack/react-query";
import { getScoutReport, getScoutAIReport } from "../api/marketdata";
import { RefreshCw, TrendingUp, Eye, Scale, AlertTriangle, Trophy, ChevronRight, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import { useState, useMemo } from "react";
import { LocationRanking } from "../types";
import { RestaurantProfileModal } from "../components/trading/RestaurantProfileModal";
import type { Restaurant } from "../components/trading/DashboardShell";

type TabId = "converting" | "imbalance" | "underserved" | "viewed" | "toplist";

interface ColumnDef {
  label: string;
  align?: "right";
  render: (item: LocationRanking, index: number) => React.ReactNode;
}

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof TrendingUp;
  dataKey: string;
  columns: ColumnDef[];
  emptyMsg: string;
}

// Signal strength indicator bar
function SignalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="scout-signal-bar">
      <div
        className="scout-signal-fill"
        style={{ width: `${pct}%`, background: color } as React.CSSProperties}
      />
    </div>
  );
}

// Format large numbers compactly
function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function RestaurantCell({ item }: { item: LocationRanking }) {
  return (
    <div className="scout-restaurant-cell">
      <span className="scout-restaurant-name">{item.locationName}</span>
      {item.city && <span className="scout-restaurant-city">{item.city}</span>}
    </div>
  );
}

const TABS: TabDef[] = [
  {
    id: "converting",
    label: "Highest Converting",
    icon: TrendingUp,
    dataKey: "highestConverting",
    emptyMsg: "No conversion data available",
    columns: [
      { label: "Restaurant", render: (item) => <RestaurantCell item={item} /> },
      { label: "Conv. Rate", align: "right", render: (item) => (
        <span className="scout-metric-highlight green">{item.conversionRate ?? 0}%</span>
      )},
      { label: "Listings (30d)", align: "right", render: (item) => (
        <span className="scout-metric-dim">{item.listingCount ?? 0}</span>
      )},
    ],
  },
  {
    id: "imbalance",
    label: "Bid/Ask Imbalance",
    icon: Scale,
    dataKey: "mostBidsLeastAsks",
    emptyMsg: "No bid/ask data available",
    columns: [
      { label: "Restaurant", render: (item) => <RestaurantCell item={item} /> },
      { label: "Bids", align: "right", render: (item) => (
        <span className="scout-metric-value">{item.bidCount ?? 0}</span>
      )},
      { label: "Listings", align: "right", render: (item) => (
        <span className="scout-metric-dim">{item.listingCount ?? 0}</span>
      )},
      { label: "Ratio", align: "right", render: (item) => {
        const ratio = (item.bidCount ?? 0) / Math.max(item.listingCount ?? 1, 1);
        const cls = ratio >= 3 ? "red" : ratio >= 1.5 ? "amber" : "dim";
        return <span className={`scout-metric-highlight ${cls}`}>{ratio.toFixed(1)}:1</span>;
      }},
    ],
  },
  {
    id: "underserved",
    label: "Underserved",
    icon: AlertTriangle,
    dataKey: "underserved",
    emptyMsg: "No underserved locations found",
    columns: [
      { label: "Restaurant", render: (item) => <RestaurantCell item={item} /> },
      { label: "Demand Gap", align: "right", render: (item) => {
        const gap = (item.bidCount ?? 0) - (item.listingCount ?? 0);
        return <span className="scout-metric-highlight amber">+{gap}</span>;
      }},
      { label: "Signal", align: "right", render: (_item, idx) => (
        <span className={`scout-signal-badge ${idx < 3 ? "strong" : idx < 8 ? "moderate" : "weak"}`}>
          {idx < 3 ? "Strong" : idx < 8 ? "Moderate" : "Weak"}
        </span>
      )},
    ],
  },
  {
    id: "viewed",
    label: "Most Viewed",
    icon: Eye,
    dataKey: "mostViewedLeastListings",
    emptyMsg: "No view data available",
    columns: [
      { label: "Restaurant", render: (item) => <RestaurantCell item={item} /> },
      { label: "Views (30d)", align: "right", render: (item) => (
        <span className="scout-metric-value">{fmtNum(item.viewCount ?? 0)}</span>
      )},
      { label: "Listings", align: "right", render: (item) => (
        <span className="scout-metric-dim">{item.listingCount ?? 0}</span>
      )},
      { label: "Demand", align: "right", render: (item, idx) => (
        <SignalBar value={item.viewCount ?? 0} max={35000} color={idx < 5 ? "var(--color-green)" : "var(--color-primary)"} />
      )},
    ],
  },
  {
    id: "toplist",
    label: "Top List",
    icon: Trophy,
    dataKey: "toplist",
    emptyMsg: "No top list data available",
    columns: [
      { label: "Restaurant", render: (item) => <RestaurantCell item={item} /> },
      { label: "AT Rank", align: "right", render: (item) => (
        <span className="scout-rank-badge">#{item.score ?? 0}</span>
      )},
      { label: "Bids", align: "right", render: (item) => (
        <span className="scout-metric-value">{item.bidCount ?? 0}</span>
      )},
      { label: "Views", align: "right", render: (item) => (
        <span className="scout-metric-dim">{fmtNum(item.viewCount ?? 0)}</span>
      )},
    ],
  },
];

export function Scout() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["scout"], queryFn: getScoutReport });
  const { data: aiData, isLoading: aiLoading, refetch: aiRefetch } = useQuery({
    queryKey: ["scoutAIReport"],
    queryFn: getScoutAIReport,
    enabled: false,
    retry: false,
  });
  const [activeTab, setActiveTab] = useState<TabId>("converting");
  const [isScanning, setIsScanning] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setShowAI(true);
    await Promise.all([refetch(), aiRefetch()]);
    setIsScanning(false);
  };

  const rawData = data?.Payload?.rawData;
  const aiReport = aiData?.Payload?.report || data?.Payload?.report || "";
  const generatedAt = data?.Payload?.generatedAt;

  // Compute summary stats
  const stats = useMemo(() => {
    if (!rawData) return null;
    const allLocations = new Set<string>();
    const allBids = new Set<string>();
    let totalViews = 0;
    let totalListings = 0;

    for (const arr of Object.values(rawData)) {
      for (const item of arr as LocationRanking[]) {
        allLocations.add(item.locationAlias);
        if ((item.bidCount ?? 0) > 0) allBids.add(item.locationAlias);
        totalViews += item.viewCount ?? 0;
        totalListings += item.listingCount ?? 0;
      }
    }

    // Cross-referenced: locations appearing in 3+ lists
    const appearances = new Map<string, number>();
    for (const arr of Object.values(rawData)) {
      const seen = new Set<string>();
      for (const item of arr as LocationRanking[]) {
        if (!seen.has(item.locationAlias)) {
          appearances.set(item.locationAlias, (appearances.get(item.locationAlias) ?? 0) + 1);
          seen.add(item.locationAlias);
        }
      }
    }
    const hotSpots = [...appearances.entries()].filter(([, count]) => count >= 3).length;

    return {
      locations: allLocations.size,
      withBids: allBids.size,
      totalViews,
      totalListings,
      hotSpots,
    };
  }, [rawData]);

  const currentTabDef = TABS.find(t => t.id === activeTab)!;
  const tabData: LocationRanking[] = rawData ? (rawData as Record<string, LocationRanking[]>)[currentTabDef.dataKey] ?? [] : [];

  return (
    <div className="scout-page">
      {/* Page header */}
      <div className="scout-header">
        <div className="scout-header-left">
          <h1 className="scout-title">Market Scout</h1>
          {generatedAt && (
            <span className="scout-timestamp">
              Last scan: {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="scout-header-actions">
          <button
            className={`scout-btn scout-btn-ai ${showAI ? "active" : ""}`}
            onClick={() => setShowAI(!showAI)}
          >
            <Sparkles size={14} />
            AI Report
          </button>
          <button
            className="scout-btn scout-btn-scan"
            onClick={handleScan}
            disabled={isScanning || isLoading}
          >
            <RefreshCw size={14} className={isScanning ? "spinning" : ""} />
            {isScanning ? "Scanning..." : "Run Scan"}
          </button>
        </div>
      </div>

      {/* Summary stats bar */}
      {stats && (
        <div className="scout-stats-bar">
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.locations}</span>
            <span className="scout-stat-label">Ranked Locations</span>
          </div>
          <div className="scout-stat-divider" />
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.withBids}</span>
            <span className="scout-stat-label">With Active Bids</span>
          </div>
          <div className="scout-stat-divider" />
          <div className="scout-stat">
            <span className="scout-stat-value">{fmtNum(stats.totalViews)}</span>
            <span className="scout-stat-label">Total Views (30d)</span>
          </div>
          <div className="scout-stat-divider" />
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.totalListings}</span>
            <span className="scout-stat-label">Active Listings</span>
          </div>
          <div className="scout-stat-divider" />
          <div className="scout-stat">
            <span className="scout-stat-value scout-stat-hot">{stats.hotSpots}</span>
            <span className="scout-stat-label">Hot Spots</span>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="scout-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const count = rawData ? ((rawData as Record<string, LocationRanking[]>)[tab.dataKey] ?? []).length : 0;
          return (
            <button
              key={tab.id}
              className={`scout-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {count > 0 && <span className="scout-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Data table */}
      <div className="scout-table-container">
        {isLoading ? (
          <div className="scout-loading">
            <RefreshCw size={16} className="spinning" />
            <span>Fetching market data...</span>
          </div>
        ) : tabData.length === 0 ? (
          <div className="scout-empty">{currentTabDef.emptyMsg}</div>
        ) : (
          <table className="scout-table">
            <thead>
              <tr>
                <th className="scout-th-rank">#</th>
                {currentTabDef.columns.map((col, i) => (
                  <th key={i} className={col.align === "right" ? "scout-th-right" : ""}>
                    {col.label}
                  </th>
                ))}
                <th className="scout-th-action" />
              </tr>
            </thead>
            <tbody>
              {tabData.map((item, index) => (
                <tr
                  key={item.locationAlias}
                  className="scout-row scout-row-clickable"
                  onClick={() => setSelectedRestaurant({
                    alias: item.locationAlias,
                    name: item.locationName,
                    city: item.city ?? "",
                    cuisineType: "",
                    avgPriceCents: 0,
                    changePct: 0,
                    color: "var(--color-primary)",
                  })}
                >
                  <td className="scout-td-rank">{index + 1}</td>
                  {currentTabDef.columns.map((col, i) => (
                    <td key={i} className={col.align === "right" ? "scout-td-right" : ""}>
                      {col.render(item, index)}
                    </td>
                  ))}
                  <td className="scout-td-action">
                    <ChevronRight size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Restaurant profile modal */}
      {selectedRestaurant && (
        <RestaurantProfileModal
          restaurant={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
        />
      )}

      {/* AI Analysis panel */}
      {showAI && (
        <div className="scout-ai-panel">
          <div className="scout-ai-header">
            <div className="scout-ai-badge">
              <Sparkles size={12} />
              AI Market Analysis
            </div>
            {aiLoading && (
              <span className="scout-ai-loading">
                <RefreshCw size={12} className="spinning" />
                Analyzing...
              </span>
            )}
          </div>
          {aiReport ? (
            <div className="scout-ai-content">
              <Markdown>{aiReport}</Markdown>
            </div>
          ) : !aiLoading ? (
            <div className="scout-ai-empty">
              Click <strong>Run Scan</strong> to generate an AI analysis of current market conditions.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
