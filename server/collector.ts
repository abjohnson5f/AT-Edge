/**
 * AT Edge Data Collector
 *
 * Pulls market data from the AT API and stores it in Neon for chart rendering.
 * Designed to run periodically (every 4-6 hours) or as a one-time backfill.
 *
 * AT API Response Format:
 *   Payload: { ATResponseObjectType, ResponseBody: { Name, MetaInformation, KeyValueList[] } }
 *
 * Data sources:
 * - get_comparable_trades (future dates) → trades table + MetaInformation (avg/high/low)
 * - get_toplist → market_snapshots (location rankings, bids, views)
 * - get_most_bids_least_asks → market_snapshots (demand signal)
 * - get_most_underserved_locations → market_snapshots
 * - get_most_viewed_locations_with_least_listings → market_snapshots
 */

import { ATAPI } from "../src/api/index.js";
import { hasDatabase, query, storeSnapshot } from "./db/index.js";
import { upsertLocation, storeTrades } from "./db/memory.js";

// ── Types ──

interface CollectionResult {
  tradesStored: number;
  snapshotsStored: number;
  locationsUpserted: number;
  errors: string[];
}

interface LocationTarget {
  alias: string;
  name: string;
  city?: string;
  inventoryTypeIds: number[];
}

// AT API nested response body
interface ATNestedPayload {
  ATResponseObjectType?: string;
  ResponseBody?: {
    Name?: string;
    MetaInformation?: Record<string, unknown>;
    KeyValueList?: Array<Record<string, string | number>>;
  };
}

// ── Helpers ──

function extractKeyValueList(payload: unknown): Array<Record<string, string | number>> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as ATNestedPayload;
  return p.ResponseBody?.KeyValueList ?? [];
}

function extractMetaInfo(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as ATNestedPayload;
  return p.ResponseBody?.MetaInformation ?? {};
}

// ── Core Collection Functions ──

/**
 * Collect market ranking snapshots from toplist + demand endpoints.
 * The AT API uses a NestedKeyValueList format with string values.
 */
export async function collectMarketRankings(api: ATAPI): Promise<{
  demandMap: Record<string, number>;
  snapshotCount: number;
  locationMap: Record<string, { name?: string; bids?: number; views?: number; rank?: number }>;
}> {
  const demandMap: Record<string, number> = {};
  const locationMap: Record<string, { name?: string; bids?: number; views?: number; rank?: number }> = {};
  let snapshotCount = 0;

  // 1. Toplist — main source of location rankings
  try {
    const toplist = await api.marketdata.getToplist({ pageSize: 25 });
    const items = extractKeyValueList(toplist.Payload);
    if (items.length > 0) {
      const scores: Record<string, { bids: number; views: number; rank: number }> = {};
      for (const item of items) {
        const alias = String(item.locationAlias ?? "");
        if (!alias) continue;
        const bids = parseInt(String(item["30DayNumberBids"] ?? "0"), 10);
        const views = parseInt(String(item["30DayATPageViews"] ?? "0"), 10);
        const rank = parseInt(String(item.GlobalATRank ?? "999"), 10);
        scores[alias] = { bids, views, rank };
        locationMap[alias] = { bids, views, rank };
        // Demand = weighted combo of bids and views
        demandMap[alias] = bids * 5 + views * 0.01;
      }
      await storeSnapshot("toplist", { locations: scores, count: items.length });
      snapshotCount++;
      console.log(`  [collector] Toplist: ${items.length} locations`);
    }
  } catch (err) {
    console.warn(`  [collector] Toplist failed: ${err instanceof Error ? err.message : err}`);
  }

  // 2. Bid/Ask imbalance
  try {
    const bidAsk = await api.marketdata.getMostBidsLeastAsks({ pageSize: 25 });
    const items = extractKeyValueList(bidAsk.Payload);
    if (items.length > 0) {
      const scores: Record<string, Record<string, string | number>> = {};
      for (const item of items) {
        const alias = String(item.locationAlias ?? "");
        if (!alias) continue;
        scores[alias] = item;
        const bids = parseInt(String(item["30DayNumberBids"] ?? "0"), 10);
        demandMap[alias] = (demandMap[alias] ?? 0) + bids * 3;
      }
      await storeSnapshot("bid_ask_imbalance", { locations: scores, count: items.length });
      snapshotCount++;
      console.log(`  [collector] Bid/Ask: ${items.length} locations`);
    }
  } catch (err) {
    console.warn(`  [collector] Bid/Ask failed: ${err instanceof Error ? err.message : err}`);
  }

  // 3. Underserved
  try {
    const underserved = await api.marketdata.getMostUnderservedLocations({ pageSize: 25 });
    const items = extractKeyValueList(underserved.Payload);
    if (items.length > 0) {
      const scores: Record<string, Record<string, string | number>> = {};
      for (const item of items) {
        const alias = String(item.locationAlias ?? "");
        if (!alias) continue;
        scores[alias] = item;
      }
      await storeSnapshot("underserved", { locations: scores, count: items.length });
      snapshotCount++;
      console.log(`  [collector] Underserved: ${items.length} locations`);
    }
  } catch (err) {
    console.warn(`  [collector] Underserved failed: ${err instanceof Error ? err.message : err}`);
  }

  // 4. Most viewed
  try {
    const viewed = await api.marketdata.getMostViewedLeastListings({ pageSize: 25 });
    const items = extractKeyValueList(viewed.Payload);
    if (items.length > 0) {
      const scores: Record<string, Record<string, string | number>> = {};
      for (const item of items) {
        const alias = String(item.locationAlias ?? "");
        if (!alias) continue;
        scores[alias] = item;
      }
      await storeSnapshot("most_viewed", { locations: scores, count: items.length });
      snapshotCount++;
      console.log(`  [collector] Most Viewed: ${items.length} locations`);
    }
  } catch (err) {
    console.warn(`  [collector] Most Viewed failed: ${err instanceof Error ? err.message : err}`);
  }

  // Store composite demand index
  if (Object.keys(demandMap).length > 0) {
    // Normalize to 0-100
    const maxDemand = Math.max(...Object.values(demandMap), 1);
    const normalized: Record<string, number> = {};
    for (const [alias, raw] of Object.entries(demandMap)) {
      normalized[alias] = parseFloat(((raw / maxDemand) * 100).toFixed(1));
    }
    await storeSnapshot("demand_index", { locations: normalized, count: Object.keys(normalized).length });
    snapshotCount++;
  }

  return { demandMap, snapshotCount, locationMap };
}

/**
 * Collect comparable trades for a location across future dates.
 * Each date call returns MetaInformation with avg/high/low and individual comps.
 *
 * We store:
 * - Individual comp trades in the trades table (for OHLC aggregation)
 * - MetaInformation summary as a market snapshot (for quick price lookups)
 */
export async function collectTradesForLocation(
  api: ATAPI,
  alias: string,
  name: string,
  inventoryTypeId: number,
  dates: string[],
): Promise<number> {
  let totalStored = 0;
  let consecutiveErrors = 0;
  const priceSummaries: Array<{ date: string; avg: number; low: number; high: number; count: number }> = [];

  for (const date of dates) {
    // Bail early if location is consistently failing (bad alias, etc.)
    if (consecutiveErrors >= 3) {
      break;
    }

    try {
      const dateTime = `${date} 19:00:00`;
      const result = await api.location.getComparableTrades({
        locationAlias: alias,
        dateTime,
        inventoryTypeID: inventoryTypeId,
      });
      consecutiveErrors = 0; // Reset on success

      const kvList = extractKeyValueList(result.Payload);
      const meta = extractMetaInfo(result.Payload);

      // Store MetaInformation summary
      const avgPrice = Number(meta.average_priceAmountInSmallestUnit ?? 0);
      const lowPrice = Number(meta.low_priceAmountInSmallestUnit ?? 0);
      const highPrice = Number(meta.high_priceAmountInSmallestUnit ?? 0);

      if (avgPrice > 0) {
        priceSummaries.push({ date, avg: avgPrice, low: lowPrice, high: highPrice, count: kvList.length });

        // Store as a synthetic "trade" for the OHLC view.
        // Use the fetched_at timestamp so daily_ohlc groups by collection date.
        // The trade_date is set to today (the date we observed this price), enabling
        // the OHLC view to show how prices evolve over collection days.
        const trades = [{
          id: `${alias}-meta-${date}`,
          priceCents: avgPrice,
          tradeDate: new Date().toISOString().slice(0, 10), // TODAY = when we observed this price
          inventoryTypeId,
          raw: { meta, forDate: date, compsCount: kvList.length },
        }];

        // Also store individual comp trades with their actual data
        for (const comp of kvList) {
          const compPrice = parseInt(String(comp.priceAmountInSmallestUnit ?? "0"), 10);
          if (compPrice > 0) {
            trades.push({
              id: `${alias}-comp-${date}-${comp.locationAlias ?? "x"}-${compPrice}`,
              priceCents: compPrice,
              tradeDate: new Date().toISOString().slice(0, 10),
              inventoryTypeId,
              raw: { ...comp, forDate: date, targetLocation: alias },
            });
          }
        }

        const stored = await storeTrades(alias, name, trades);
        totalStored += stored;
      }

      // Rate limit: 250ms between calls
      await new Promise(r => setTimeout(r, 250));
    } catch (err) {
      consecutiveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      // Bail immediately on unknown alias (no point retrying)
      if (msg.includes("Unknown Alias")) {
        console.warn(`  [collector] ${alias}: Unknown alias, skipping remaining dates`);
        break;
      }
      if (!msg.includes("Must be a future date")) {
        console.warn(`  [collector] ${alias} ${date}: ${msg}`);
      }
    }
  }

  // Store price curve snapshot for this location
  if (priceSummaries.length > 0) {
    await storeSnapshot("price_curve", {
      locationAlias: alias,
      inventoryTypeId,
      collectedAt: new Date().toISOString(),
      prices: priceSummaries,
    });
  }

  return totalStored;
}

/**
 * Discover inventory types for a location.
 */
export async function getInventoryTypes(api: ATAPI, alias: string): Promise<number[]> {
  try {
    const result = await api.location.getInventoryTypes(alias);
    const kvList = extractKeyValueList(result.Payload);
    if (kvList.length > 0) {
      return kvList
        .map(t => parseInt(String(t.inventoryTypeID ?? "0"), 10))
        .filter(id => id > 0);
    }
    // Also check for direct Payload array format
    if (Array.isArray(result.Payload)) {
      return (result.Payload as Array<{ inventoryTypeID: number }>)
        .map(t => t.inventoryTypeID)
        .filter(Boolean);
    }
  } catch {
    // Default to common inventory type IDs
  }
  return [2]; // Default: standard reservation (Table for 4)
}

/**
 * Discover top locations from toplist and upsert them.
 */
export async function discoverLocations(api: ATAPI): Promise<LocationTarget[]> {
  const seen = new Map<string, LocationTarget>();

  try {
    const toplist = await api.marketdata.getToplist({ pageSize: 25 });
    const items = extractKeyValueList(toplist.Payload);
    for (const item of items) {
      const alias = String(item.locationAlias ?? "");
      if (alias && !seen.has(alias)) {
        seen.set(alias, {
          alias,
          name: alias.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          inventoryTypeIds: [],
        });
      }
    }
  } catch { /* ok */ }

  const locations = Array.from(seen.values());

  // Upsert and get inventory types
  for (const loc of locations) {
    try {
      await upsertLocation(loc.alias, loc.name, loc.city);
      loc.inventoryTypeIds = await getInventoryTypes(api, loc.alias);
      await new Promise(r => setTimeout(r, 200));
    } catch { /* skip */ }
  }

  return locations;
}

/**
 * Generate future date strings for the next N days (YYYY-MM-DD format).
 * Comparable trades require future dates.
 */
export function generateFutureDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    // Include weekends for restaurants (they're busier on weekends)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

// ── Main Collection Runner ──

/**
 * Run a full collection cycle.
 * @param futureDays - Number of future days to pull comparable trades for
 * @param maxLocations - Max locations to collect trades for
 */
export async function runCollection(
  futureDays = 14,
  maxLocations = 10,
): Promise<CollectionResult> {
  if (!hasDatabase()) {
    return { tradesStored: 0, snapshotsStored: 0, locationsUpserted: 0, errors: ["No database configured"] };
  }

  const result: CollectionResult = {
    tradesStored: 0,
    snapshotsStored: 0,
    locationsUpserted: 0,
    errors: [],
  };

  const api = new ATAPI();

  console.log(`  [collector] Starting collection (${futureDays} future days, max ${maxLocations} locations)`);

  // Step 1: Collect market ranking snapshots
  let locationMap: Record<string, { name?: string }> = {};
  try {
    const rankings = await collectMarketRankings(api);
    result.snapshotsStored += rankings.snapshotCount;
    locationMap = rankings.locationMap;
    console.log(`  [collector] Stored ${rankings.snapshotCount} market snapshots`);
  } catch (err) {
    result.errors.push(`Market rankings: ${err instanceof Error ? err.message : err}`);
  }

  // Step 2: Discover locations
  let locations: LocationTarget[] = [];
  try {
    locations = await discoverLocations(api);
    result.locationsUpserted = locations.length;
    console.log(`  [collector] Discovered ${locations.length} locations`);
  } catch (err) {
    result.errors.push(`Discovery: ${err instanceof Error ? err.message : err}`);
  }

  // Step 3: Collect comparable trades for top locations
  const dates = generateFutureDateRange(futureDays);
  const targetLocations = locations.slice(0, maxLocations);

  for (const loc of targetLocations) {
    const invTypeId = loc.inventoryTypeIds[0] ?? 2;
    try {
      const stored = await collectTradesForLocation(api, loc.alias, loc.name, invTypeId, dates);
      result.tradesStored += stored;
      console.log(`  [collector] ${loc.alias}: ${stored} trades`);
    } catch (err) {
      result.errors.push(`${loc.alias}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`  [collector] Done: ${result.tradesStored} trades, ${result.snapshotsStored} snapshots`);
  return result;
}
