import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPriceCheck } from "../api/marketdata";
import { getLocations } from "../api/location";
import { formatCurrency, formatDate } from "../lib/utils";
import { Search, TrendingUp, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

export function PriceCheck() {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [inventoryType, setInventoryType] = useState("1");
  const [hasSearched, setHasSearched] = useState(false);
  const [locationOptions, setLocationOptions] = useState<Array<{ alias: string; name?: string }>>([]);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    getLocations()
      .then((data) => setLocationOptions(data?.locations ?? []))
      .catch(() => {});
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["priceCheck", location, date, time, inventoryType],
    queryFn: () => getPriceCheck(location, date, time, parseInt(inventoryType)),
    enabled: false,
  });

  const handleCheck = () => {
    if (!location.trim()) return;
    setHasSearched(true);
    refetch();
  };

  const result = (data as any)?.Payload ?? data;
  const comparables = result?.comparables;
  const metrics = result?.metrics;
  const forecast = result?.forecast;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Price Check</h1>
      </div>

      {/* Search form */}
      <div className="pc-form">
        <div className="pc-form-field pc-form-field-wide">
          <label className="pc-label">Restaurant</label>
          <input
            type="text"
            className="pc-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. carbone-new-york"
            list="location-options"
          />
          <datalist id="location-options">
            {locationOptions.map((loc) => (
              <option key={loc.alias} value={loc.alias}>
                {loc.name ?? loc.alias}
              </option>
            ))}
          </datalist>
        </div>
        <div className="pc-form-field">
          <label className="pc-label">Date</label>
          <input
            type="date"
            className="pc-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className="pc-hint">Must be a future date</span>
        </div>
        <div className="pc-form-field">
          <label className="pc-label">Time</label>
          <input
            type="time"
            className="pc-input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div className="pc-form-field">
          <label className="pc-label">&nbsp;</label>
          <button
            type="button"
            className="pc-search-btn"
            onClick={handleCheck}
            disabled={isLoading || !location.trim()}
          >
            <Search size={14} />
            {isLoading ? "Checking..." : "Check"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="scout-loading"><RefreshCw size={16} className="spinning" /> Analyzing market data...</div>
      )}

      {/* Results */}
      {hasSearched && result && !isLoading && (
        <div className="pc-results">
          {/* Comparables */}
          <div className="pc-card">
            <div className="pc-card-header">Comparable Trades</div>
            <div className="pc-card-body">
              {comparables && comparables.count > 0 ? (
                <>
                  <div className="pc-hero-metric">
                    <span className="pc-hero-label">Average Clearing Price</span>
                    <span className="pc-hero-value">{formatCurrency(comparables.averageCents)}</span>
                  </div>
                  <div className="pc-metric-row">
                    <div className="pc-metric-box">
                      <span className="pc-metric-box-label">Median</span>
                      <span className="pc-metric-box-value">{formatCurrency(comparables.medianCents)}</span>
                    </div>
                    <div className="pc-metric-box">
                      <span className="pc-metric-box-label">Sample Size</span>
                      <span className="pc-metric-box-value">{comparables.count} trades</span>
                    </div>
                  </div>
                  {comparables.trades && comparables.trades.length > 0 && (
                    <div className="pc-trades">
                      <div className="pc-trades-title">Recent Trades</div>
                      {comparables.trades.map((t: any) => (
                        <div key={t.id} className="pc-trade-row">
                          <span className="pc-trade-date">{t.date ? formatDate(t.date) : "N/A"}</span>
                          <span className="pc-trade-price">{formatCurrency(t.priceCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="pc-empty">
                  <AlertCircle size={28} />
                  <span>No comparable trades found</span>
                  <span className="pc-empty-hint">Ensure the date is in the future and the restaurant alias is valid.</span>
                </div>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="pc-card">
            <div className="pc-card-header">Market Metrics (90d)</div>
            <div className="pc-card-body">
              {metrics ? (
                <div className="pc-metrics-grid">
                  <div className="pc-metric-tile">
                    <span className="pc-metric-tile-label">Conversion Rate</span>
                    <span className="pc-metric-tile-value pc-green">{metrics.conversionRate}%</span>
                  </div>
                  <div className="pc-metric-tile">
                    <span className="pc-metric-tile-label">Bid/Ask Ratio</span>
                    <span className="pc-metric-tile-value pc-amber">{metrics.bidToAskRatio}</span>
                  </div>
                  <div className="pc-metric-tile">
                    <span className="pc-metric-tile-label">Avg Days on Market</span>
                    <span className="pc-metric-tile-value">{metrics.avgDaysOnMarket}</span>
                  </div>
                  <div className="pc-metric-tile">
                    <span className="pc-metric-tile-label">Popularity Score</span>
                    <span className="pc-metric-tile-value">{metrics.popularityScore}/100</span>
                  </div>
                </div>
              ) : (
                <div className="pc-empty">
                  <AlertCircle size={28} />
                  <span>Metrics unavailable</span>
                </div>
              )}
            </div>
          </div>

          {/* Forecast */}
          <div className="pc-card pc-card-forecast">
            <div className="pc-card-header pc-green">
              <TrendingUp size={16} /> Edge Forecast
            </div>
            <div className="pc-card-body">
              {forecast && forecast.recommendedPriceCents > 0 ? (
                <>
                  <div className="pc-hero-metric">
                    <span className="pc-hero-label">Recommended List Price</span>
                    <span className="pc-hero-value">{formatCurrency(forecast.recommendedPriceCents)}</span>
                    <span className="pc-hero-sub pc-green">
                      <CheckCircle2 size={14} /> Target Profit: {formatCurrency(forecast.profitTargetCents)}
                    </span>
                  </div>
                  <div className="pc-forecast-rows">
                    <div className="pc-forecast-row">
                      <span>Predicted Demand</span>
                      <span className={
                        forecast.demandLevel === "High" ? "pc-green" :
                        forecast.demandLevel === "Medium" ? "pc-amber" : ""
                      }>{forecast.demandLevel}</span>
                    </div>
                    <div className="pc-forecast-row">
                      <span>YoY Price Change</span>
                      <span className={forecast.yoyChangePercent >= 0 ? "pc-green" : "pc-red"}>
                        {forecast.yoyChangePercent >= 0 ? "+" : ""}{forecast.yoyChangePercent}%
                      </span>
                    </div>
                  </div>
                  <button type="button" className="pc-cta-btn">
                    Create Listing at {formatCurrency(forecast.recommendedPriceCents)}
                  </button>
                </>
              ) : (
                <div className="pc-empty">
                  <AlertCircle size={28} />
                  <span>Insufficient data for forecast</span>
                  <span className="pc-empty-hint">Try a different restaurant or future date.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
