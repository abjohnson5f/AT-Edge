import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getListings, updateListingPrice, toggleVisibility, archiveListing } from "../api/listing";
import { getPortfolioReview } from "../api/portfolio";
import { formatCurrency, formatDate, formatTime } from "../lib/utils";
import { Sparkles, TrendingUp, AlertTriangle, MoreHorizontal, RefreshCw, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import { useToast } from "../components/ui/use-toast";
import { Listing } from "../types";

function getDaysUntil(dateStr: string) {
  // Parse as local date to avoid UTC midnight rolling back a day
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const target = match
    ? new Date(+match[1], +match[2] - 1, +match[3])
    : new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
}

export function Portfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: listingsData, isLoading } = useQuery({ queryKey: ["listings"], queryFn: getListings });
  const { data: reviewData, isLoading: reviewLoading, refetch: reviewRefetch } = useQuery({
    queryKey: ["portfolioReview"],
    queryFn: getPortfolioReview,
    enabled: false,
    retry: false,
  });
  const [showReview, setShowReview] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [repriceOpen, setRepriceOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [repriceLoading, setRepriceLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleReprice = async (execute: boolean) => {
    if (!selectedListing) return;
    const priceCents = Math.round(parseFloat(newPrice) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      toast({ title: "Invalid price", description: "Enter a valid dollar amount.", variant: "destructive" });
      return;
    }
    setRepriceLoading(true);
    try {
      await updateListingPrice(selectedListing.listingID, priceCents, execute);
      if (execute) {
        toast({ title: "Price updated", description: `${selectedListing.locationName} repriced to ${formatCurrency(priceCents)}.` });
        setRepriceOpen(false);
        setNewPrice("");
        queryClient.invalidateQueries({ queryKey: ["listings"] });
      } else {
        toast({ title: "Dry run successful", description: `Reprice to ${formatCurrency(priceCents)} validated.` });
      }
    } catch (err) {
      toast({ title: "Reprice failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRepriceLoading(false);
    }
  };

  const handleToggleVisibility = async (listing: Listing) => {
    try {
      await toggleVisibility(listing.listingID, !listing.marketVisibility, true);
      toast({ title: "Visibility updated", description: `${listing.locationName} is now ${listing.marketVisibility ? "hidden" : "visible"}.` });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (err) {
      toast({ title: "Toggle failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
    setMenuOpen(null);
  };

  const handleArchive = async () => {
    if (!selectedListing) return;
    setArchiveLoading(true);
    try {
      await archiveListing(selectedListing.listingID, true);
      toast({ title: "Listing archived", description: `${selectedListing.locationName} has been archived.` });
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (err) {
      toast({ title: "Archive failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleAIReview = () => {
    setShowReview(!showReview);
    if (!showReview && !reviewData) reviewRefetch();
  };

  const allListings: Listing[] = Array.isArray(listingsData?.Payload) ? listingsData.Payload : [];
  const listings = allListings.filter(l => getDaysUntil(l.dateTime) >= 0);
  const totalValue = listings.reduce((sum: number, l: Listing) => sum + (l.priceAmountInSmallestUnit || 0), 0);
  const expiring = listings.filter(l => getDaysUntil(l.dateTime) <= 2).length;
  const aiReport = reviewData?.Payload?.report || "";

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Portfolio</h1>
        <button className={`scout-btn scout-btn-ai ${showReview ? "active" : ""}`} onClick={handleAIReview}>
          <Sparkles size={14} />
          AI Review
        </button>
      </div>

      {/* AI Review panel */}
      {showReview && (
        <div className="scout-ai-panel">
          <div className="scout-ai-header">
            <div className="scout-ai-badge"><Sparkles size={12} /> Portfolio Analysis</div>
            {reviewLoading && <span className="scout-ai-loading"><RefreshCw size={12} className="spinning" /> Analyzing...</span>}
          </div>
          {aiReport ? (
            <div className="scout-ai-content"><Markdown>{aiReport}</Markdown></div>
          ) : !reviewLoading ? (
            <div className="scout-ai-empty">Loading AI review of your portfolio...</div>
          ) : null}
        </div>
      )}

      {/* Stats bar */}
      <div className="scout-stats-bar">
        <div className="scout-stat">
          <span className="scout-stat-value">{formatCurrency(totalValue)}</span>
          <span className="scout-stat-label">Total Value</span>
        </div>
        <div className="scout-stat-divider" />
        <div className="scout-stat">
          <span className="scout-stat-value">{listings.length}</span>
          <span className="scout-stat-label">Active Listings</span>
        </div>
        <div className="scout-stat-divider" />
        <div className="scout-stat">
          <span className={`scout-stat-value ${expiring > 0 ? "scout-stat-hot" : ""}`}>{expiring}</span>
          <span className="scout-stat-label">Expiring &lt; 48h</span>
        </div>
      </div>

      {/* Listings table */}
      <div className="scout-table-container">
        {isLoading ? (
          <div className="scout-loading"><RefreshCw size={16} className="spinning" /> Loading portfolio...</div>
        ) : listings.length === 0 ? (
          <div className="scout-empty">No active listings. Import a reservation to get started.</div>
        ) : (
          <table className="scout-table">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Date & Time</th>
                <th>Type</th>
                <th className="scout-th-right">Price</th>
                <th className="scout-th-right">Score</th>
                <th className="scout-th-right">Days</th>
                <th className="scout-th-action" />
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const days = getDaysUntil(listing.dateTime);
                return (
                  <tr key={listing.listingID} className="scout-row">
                    <td>
                      <div className="scout-restaurant-cell">
                        <span className="scout-restaurant-name">
                          {listing.locationName}
                          {!listing.marketVisibility && <span className="portfolio-hidden-badge">Hidden</span>}
                        </span>
                        <span className="scout-restaurant-city">{listing.locationCitySlug?.replace(/-/g, " ") || listing.locationAlias}</span>
                      </div>
                    </td>
                    <td>
                      <div className="scout-restaurant-cell">
                        <span className="scout-restaurant-name">{formatDate(listing.dateTime)}</span>
                        <span className="scout-restaurant-city">{formatTime(listing.dateTime)}</span>
                      </div>
                    </td>
                    <td><span className="scout-metric-dim">{listing.inventoryTypeName}</span></td>
                    <td className="scout-td-right">
                      <span className="scout-metric-value portfolio-price">{formatCurrency(listing.priceAmountInSmallestUnit)}</span>
                    </td>
                    <td className="scout-td-right">
                      <span className={`scout-signal-badge ${listing.popularityScoreBracket && listing.popularityScoreBracket >= 8 ? "strong" : listing.popularityScoreBracket && listing.popularityScoreBracket >= 5 ? "moderate" : "weak"}`}>
                        {listing.popularityScoreBracket}/10
                      </span>
                    </td>
                    <td className="scout-td-right">
                      <span className={days <= 2 ? "portfolio-days-urgent" : "scout-metric-dim"}>
                        {days <= 2 && <AlertTriangle size={12} />}
                        {days}d
                      </span>
                    </td>
                    <td className="scout-td-action" style={{ position: "relative" }} ref={menuOpen === listing.listingID ? menuRef : undefined}>
                      <button
                        className="portfolio-menu-btn"
                        onClick={() => setMenuOpen(menuOpen === listing.listingID ? null : listing.listingID)}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuOpen === listing.listingID && (
                        <div className="portfolio-dropdown">
                          <button className="portfolio-dropdown-item" onClick={() => {
                            setSelectedListing(listing);
                            setNewPrice((listing.priceAmountInSmallestUnit / 100).toFixed(2));
                            setRepriceOpen(true);
                            setMenuOpen(null);
                          }}>
                            <TrendingUp size={14} /> Reprice
                          </button>
                          <button className="portfolio-dropdown-item" onClick={() => handleToggleVisibility(listing)}>
                            {listing.marketVisibility ? "Hide from Market" : "Show on Market"}
                          </button>
                          <button className="portfolio-dropdown-item danger" onClick={() => {
                            setSelectedListing(listing);
                            setArchiveOpen(true);
                            setMenuOpen(null);
                          }}>
                            Archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reprice Modal */}
      {repriceOpen && selectedListing && (
        <div className="modal-overlay" onClick={() => { setRepriceOpen(false); setNewPrice(""); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reprice Listing</h3>
              <button className="modal-close" onClick={() => { setRepriceOpen(false); setNewPrice(""); }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-restaurant">
                <div className="modal-restaurant-name">{selectedListing.locationName}</div>
                <div className="modal-restaurant-meta">Current: {formatCurrency(selectedListing.priceAmountInSmallestUnit)}</div>
              </div>
              <div className="modal-field">
                <label>New Price</label>
                <div className="modal-price-input">
                  <span className="modal-price-prefix">$</span>
                  <input type="number" step="0.01" min="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="modal-actions">
                <button className="modal-btn secondary" onClick={() => handleReprice(false)} disabled={repriceLoading}>Dry Run</button>
                <button className="modal-btn primary" onClick={() => handleReprice(true)} disabled={repriceLoading}>
                  {repriceLoading ? "Processing..." : "Confirm Reprice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {archiveOpen && selectedListing && (
        <div className="modal-overlay" onClick={() => setArchiveOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive Listing</h3>
              <button className="modal-close" onClick={() => setArchiveOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-5)" }}>
                Are you sure? This listing for <strong>{selectedListing.locationName}</strong> will be archived.
              </p>
              <div className="modal-actions">
                <button className="modal-btn secondary" onClick={() => setArchiveOpen(false)}>Cancel</button>
                <button className="modal-btn danger" onClick={handleArchive} disabled={archiveLoading}>
                  {archiveLoading ? "Archiving..." : "Confirm Archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
