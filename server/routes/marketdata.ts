import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";
import { runAgent } from "../agent.js";
import { hasDatabase, storeSnapshot } from "../db/index.js";

export const marketdataRoutes = Router();

// ── Scout helpers ──

/** AT API nested response body shape */
interface ATNestedPayload {
  ATResponseObjectType?: string;
  ResponseBody?: {
    Name?: string;
    MetaInformation?: Record<string, unknown>;
    KeyValueList?: Array<Record<string, string | number>>;
  };
}

/** Extract the KeyValueList from the AT nested payload */
function extractKeyValueList(payload: unknown): Array<Record<string, string | number>> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as ATNestedPayload;
  return p.ResponseBody?.KeyValueList ?? [];
}

/** Known multi-word cities first, then single-word */
const KNOWN_CITIES = [
  "New York", "Los Angeles", "San Francisco", "San Diego", "Las Vegas",
  "Mexico City", "Hong Kong", "Buenos Aires", "Tel Aviv", "Park City",
  "Scottsdale", "West Hollywood", "Beverly Hills", "Santa Monica",
  "Miami", "Chicago", "Austin", "Dallas", "Houston", "Denver",
  "Seattle", "Boston", "Nashville", "Atlanta", "Philadelphia",
  "Malibu", "Aspen", "Napa", "Vancouver", "Toronto", "Montreal",
  "London", "Paris", "Tokyo", "Dubai", "Sydney",
];

/** Extract city from alias (e.g., "carbone-new-york" → "New York") */
function extractCityFromAlias(alias: string): string {
  const aliasLower = alias.toLowerCase();
  for (const city of KNOWN_CITIES) {
    const citySlug = city.toLowerCase().replace(/\s+/g, "-");
    if (aliasLower.endsWith(citySlug) || aliasLower.includes("-" + citySlug + "-")) {
      return city;
    }
  }
  return "";
}

/** Derive a display name from the alias (title-case, hyphens → spaces) */
function nameFromAlias(alias: string): string {
  // Remove trailing city slug for cleaner name
  let base = alias;
  const city = extractCityFromAlias(alias);
  if (city) {
    const citySlug = city.toLowerCase().replace(/\s+/g, "-");
    base = base.replace(new RegExp(`-?${citySlug}$`), "");
  }
  return base.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface LocationRankingRow {
  locationAlias: string;
  locationName: string;
  city: string;
  score: number;
  bidCount: number;
  listingCount: number;
  viewCount: number;
  conversionRate: number;
}

/** Parse a KeyValueList array into LocationRankingRow[] */
function parseRankings(items: Array<Record<string, string | number>>): LocationRankingRow[] {
  return items.map((item, idx) => {
    const alias = String(item.locationAlias ?? "");
    return {
      locationAlias: alias,
      locationName: nameFromAlias(alias),
      city: extractCityFromAlias(alias),
      score: parseInt(String(item.GlobalATRank ?? item.score ?? idx + 1), 10),
      bidCount: parseInt(String(item["30DayNumberBids"] ?? item.bidCount ?? "0"), 10),
      listingCount: parseInt(String(item["30DayNumberListings"] ?? item.listingCount ?? "0"), 10),
      viewCount: parseInt(String(item["30DayATPageViews"] ?? item.viewCount ?? "0"), 10),
      conversionRate: parseFloat(String(item["30DayConversionRate"] ?? item.conversionRate ?? "0")),
    };
  }).filter(r => r.locationAlias);
}

/**
 * Fetch a single page from an AT marketdata endpoint (max 25 results per AT account permission).
 * The AT API does NOT support true pagination — pageNumber multiplies the result count,
 * and the account's MaximumMarketDataResults (25) is a hard cap on total results.
 */
async function fetchEndpoint(
  apiFn: (params: { pageSize: number }) => Promise<{ Payload?: unknown }>,
  label: string
): Promise<Array<Record<string, string | number>>> {
  try {
    const result = await apiFn({ pageSize: 25 });
    return extractKeyValueList(result.Payload);
  } catch (err) {
    console.warn(`[scout] ${label} failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

const SCOUT_SYSTEM = `You are AT Edge Scout, an intelligent market analyst for AppointmentTrader.

You are given structured market data from 5 ranking endpoints. Analyze the data and produce an actionable intelligence report.

Your job:
1. Cross-reference locations that appear in multiple lists — these are the strongest signals
2. Produce an actionable report with:
   - Top opportunities ranked by conviction
   - Specific data points backing each recommendation
   - Price ranges and risk levels
   - Clear recommended actions (list, bid, or monitor)

Be quantitative. Use actual numbers. Format in clean markdown.`;

// GET /api/marketdata/scout — Fast: direct AT API calls, paginated for ALL data
marketdataRoutes.get("/scout", async (_req, res) => {
  try {
    const api = new ATAPI();

    // 5 parallel live AT API calls (25 results max per endpoint — AT account limit)
    const [
      highestConvertingItems,
      mostBidsLeastAsksItems,
      underservedItems,
      mostViewedItems,
      toplistItems,
    ] = await Promise.all([
      fetchEndpoint((p) => api.marketdata.getHighestConvertingLocations(p), "highestConverting"),
      fetchEndpoint((p) => api.marketdata.getMostBidsLeastAsks(p), "mostBidsLeastAsks"),
      fetchEndpoint((p) => api.marketdata.getMostUnderservedLocations(p), "underserved"),
      fetchEndpoint((p) => api.marketdata.getMostViewedLeastListings(p), "mostViewedLeastListings"),
      fetchEndpoint((p) => api.marketdata.getToplist(p), "toplist"),
    ]);

    const rawData = {
      highestConverting: parseRankings(highestConvertingItems),
      mostBidsLeastAsks: parseRankings(mostBidsLeastAsksItems),
      underserved: parseRankings(underservedItems),
      mostViewedLeastListings: parseRankings(mostViewedItems),
      toplist: parseRankings(toplistItems),
    };

    const totalLocations = new Set([
      ...rawData.highestConverting.map(r => r.locationAlias),
      ...rawData.mostBidsLeastAsks.map(r => r.locationAlias),
      ...rawData.underserved.map(r => r.locationAlias),
      ...rawData.mostViewedLeastListings.map(r => r.locationAlias),
      ...rawData.toplist.map(r => r.locationAlias),
    ]).size;

    console.log(`[scout] Fetched ${totalLocations} unique locations across all endpoints`);

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        rawData,
        report: "",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/marketdata/scout/report — Slow: Claude agent analysis (called separately)
marketdataRoutes.get("/scout/report", async (_req, res) => {
  try {
    const api = new ATAPI();

    // Re-fetch live data for analysis context
    const [
      highestConvertingItems,
      mostBidsLeastAsksItems,
      underservedItems,
      mostViewedItems,
      toplistItems,
    ] = await Promise.all([
      fetchEndpoint((p) => api.marketdata.getHighestConvertingLocations(p), "highestConverting"),
      fetchEndpoint((p) => api.marketdata.getMostBidsLeastAsks(p), "mostBidsLeastAsks"),
      fetchEndpoint((p) => api.marketdata.getMostUnderservedLocations(p), "underserved"),
      fetchEndpoint((p) => api.marketdata.getMostViewedLeastListings(p), "mostViewedLeastListings"),
      fetchEndpoint((p) => api.marketdata.getToplist(p), "toplist"),
    ]);

    const rawData = {
      highestConverting: parseRankings(highestConvertingItems),
      mostBidsLeastAsks: parseRankings(mostBidsLeastAsksItems),
      underserved: parseRankings(underservedItems),
      mostViewedLeastListings: parseRankings(mostViewedItems),
      toplist: parseRankings(toplistItems),
    };

    const dataSummary = Object.entries(rawData)
      .map(([key, arr]) => `### ${key} (${arr.length} results)\n${arr.length > 0
        ? arr.slice(0, 10).map((r, i) => `${i + 1}. ${r.locationName} (${r.locationAlias}) — bids: ${r.bidCount}, listings: ${r.listingCount}, views: ${r.viewCount}, score: ${r.score}`).join("\n")
        : "(no data — endpoint may be unavailable for this account)"}`)
      .join("\n\n");

    const result = await runAgent(
      SCOUT_SYSTEM,
      `Analyze this market data and produce an intelligence report with the top opportunities.\n\nToday's date: ${new Date().toLocaleDateString("en-US")}\n\n${dataSummary}\n\nIMPORTANT: After your analysis, use the memory_learn tool to store any significant market patterns you discover.`,
      { sessionType: "scout" },
    );

    // Persist scout report as market snapshot
    if (hasDatabase()) {
      try {
        await storeSnapshot("scout_report", {
          report: result.text,
          rawData,
        }, result.sessionId);
      } catch { /* optional */ }
    }

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: { report: result.text },
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/marketdata/highest-converting
marketdataRoutes.get("/highest-converting", async (req, res) => {
  try {
    const api = new ATAPI();
    const pageSize = Number(req.query.pageSize ?? 25);
    const result = await api.marketdata.getHighestConvertingLocations({ pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/marketdata/bid-imbalance
marketdataRoutes.get("/bid-imbalance", async (req, res) => {
  try {
    const api = new ATAPI();
    const pageSize = Number(req.query.pageSize ?? 25);
    const result = await api.marketdata.getMostBidsLeastAsks({ pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/marketdata/underserved
marketdataRoutes.get("/underserved", async (req, res) => {
  try {
    const api = new ATAPI();
    const pageSize = Number(req.query.pageSize ?? 25);
    const result = await api.marketdata.getMostUnderservedLocations({ pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/marketdata/most-viewed
marketdataRoutes.get("/most-viewed", async (req, res) => {
  try {
    const api = new ATAPI();
    const pageSize = Number(req.query.pageSize ?? 25);
    const result = await api.marketdata.getMostViewedLeastListings({ pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/marketdata/toplist
marketdataRoutes.get("/toplist", async (req, res) => {
  try {
    const api = new ATAPI();
    const pageSize = Number(req.query.pageSize ?? 25);
    const result = await api.marketdata.getToplist({ pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// ── Price Check helpers ──

interface ParsedComparables {
  averageCents: number;
  medianCents: number;
  count: number;
  trades: Array<{ id: string; date: string; priceCents: number }>;
}

interface ParsedMetrics {
  conversionRate: number;
  bidToAskRatio: number;
  avgDaysOnMarket: number;
  popularityScore: number;
}

interface ParsedForecast {
  recommendedPriceCents: number;
  profitTargetCents: number;
  demandLevel: string;
  yoyChangePercent: number;
}

function parseComparables(data: any): ParsedComparables {
  const empty: ParsedComparables = { averageCents: 0, medianCents: 0, count: 0, trades: [] };
  try {
    const payload = data?.Payload;
    if (!payload) return empty;

    const body = payload.ResponseBody ?? payload;
    const meta = payload.MetaInformation ?? body?.MetaInformation ?? {};
    const kvList: any[] = body?.KeyValueList ?? body ?? [];

    // Parse individual trades from the KeyValueList
    const trades: Array<{ id: string; date: string; priceCents: number }> = [];
    for (const item of kvList) {
      if (!item) continue;
      const kv = item.KeyValueList ?? item;
      let priceCents = 0;
      let date = "";
      let id = "";

      if (Array.isArray(kv)) {
        for (const entry of kv) {
          const key = entry?.Key ?? entry?.key ?? "";
          const val = entry?.Value ?? entry?.value ?? "";
          if (key === "priceAmountInSmallestUnit") priceCents = parseInt(val, 10) || 0;
          if (key === "dateTime" || key === "date") date = val;
          if (key === "transactionID" || key === "id" || key === "listingID") id = val;
        }
      } else if (typeof kv === "object") {
        priceCents = parseInt(kv.priceAmountInSmallestUnit ?? kv.price ?? "0", 10) || 0;
        date = kv.dateTime ?? kv.date ?? "";
        id = kv.transactionID ?? kv.id ?? kv.listingID ?? "";
      }

      if (priceCents > 0) {
        trades.push({ id: id || `trade-${trades.length}`, date, priceCents });
      }
    }

    // Use MetaInformation if available
    const avgFromMeta = parseInt(meta.average_priceAmountInSmallestUnit ?? "0", 10);

    const prices = trades.map((t) => t.priceCents).filter((p) => p > 0);
    const count = prices.length;

    let averageCents = avgFromMeta;
    if (!averageCents && count > 0) {
      averageCents = Math.round(prices.reduce((a, b) => a + b, 0) / count);
    }

    let medianCents = 0;
    if (count > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianCents = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    return { averageCents, medianCents, count, trades };
  } catch {
    return empty;
  }
}

function parsePriceCheckMetrics(data: any): ParsedMetrics {
  const empty: ParsedMetrics = { conversionRate: 0, bidToAskRatio: 0, avgDaysOnMarket: 0, popularityScore: 0 };
  try {
    const payload = data?.Payload;
    if (!payload) return empty;

    const body = payload.ResponseBody ?? payload;
    const kvList: any[] = body?.KeyValueList ?? body ?? [];

    const vals: Record<string, number> = {};
    for (const item of kvList) {
      const kv = item?.KeyValueList ?? item;
      if (Array.isArray(kv)) {
        for (const entry of kv) {
          const key = entry?.Key ?? entry?.key ?? "";
          const val = entry?.Value ?? entry?.value ?? "0";
          vals[key] = parseFloat(val) || 0;
        }
      } else if (typeof kv === "object") {
        for (const [key, val] of Object.entries(kv)) {
          vals[key] = parseFloat(String(val)) || 0;
        }
      }
    }

    const txCount = vals["TransactionCount"] ?? 0;
    const activeBids = vals["ActiveBids"] ?? 0;
    const pageVisitors = vals["PageVisitors"] ?? 0;
    const lowPrice = vals["LowPrice"] ?? 0;
    const highPrice = vals["HighPrice"] ?? 0;

    const totalActivity = txCount + activeBids;
    const conversionRate = totalActivity > 0 ? Math.round((txCount / totalActivity) * 100 * 10) / 10 : 0;
    const bidToAskRatio = txCount > 0 ? Math.round((activeBids / Math.max(txCount, 1)) * 100) / 100 : 0;
    const avgDaysOnMarket = highPrice > 0 && lowPrice > 0
      ? Math.max(1, Math.round(((highPrice - lowPrice) / highPrice) * 30))
      : 0;
    const popularityScore = Math.min(100, Math.round((pageVisitors / 1000) * 100));

    return { conversionRate, bidToAskRatio, avgDaysOnMarket, popularityScore };
  } catch {
    return empty;
  }
}

function deriveForecastFromComps(comps: ParsedComparables, metrics: ParsedMetrics): ParsedForecast {
  const basePriceCents = comps.averageCents || comps.medianCents || 0;
  const demandMultiplier = metrics.bidToAskRatio > 1 ? 1.05 : metrics.bidToAskRatio > 0.5 ? 1.02 : 1.0;
  const recommendedPriceCents = Math.round(basePriceCents * demandMultiplier);
  const profitTargetCents = Math.round(recommendedPriceCents * 0.15);
  const demandLevel = metrics.bidToAskRatio > 1.5 ? "High" : metrics.bidToAskRatio > 0.5 ? "Medium" : "Low";
  return { recommendedPriceCents, profitTargetCents, demandLevel, yoyChangePercent: 0 };
}

// GET /api/marketdata/price-check — Direct API calls + Agent forecast
marketdataRoutes.get("/price-check", async (req, res) => {
  const { locationAlias, dateTime, inventoryTypeID } = req.query;

  if (!locationAlias || !dateTime) {
    return res.status(400).json({
      RequestStatus: "Failed",
      ResponseMessage: "locationAlias and dateTime are required",
    });
  }

  const alias = locationAlias as string;
  const dt = dateTime as string;
  const invType = parseInt((inventoryTypeID as string) ?? "2", 10);
  const api = new ATAPI();

  // ── 1. Comparables (direct AT API call) ──
  let comparables: ParsedComparables = { averageCents: 0, medianCents: 0, count: 0, trades: [] };
  try {
    const compsRaw = await api.location.getComparableTrades({
      locationAlias: alias,
      dateTime: dt,
      inventoryTypeID: invType,
    });
    comparables = parseComparables(compsRaw);
  } catch (err) {
    console.warn(`[price-check] Comparables failed for ${alias}: ${err}`);
  }

  // ── 2. Metrics (direct AT API call) ──
  let metrics: ParsedMetrics = { conversionRate: 0, bidToAskRatio: 0, avgDaysOnMarket: 0, popularityScore: 0 };
  try {
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const metricsRaw = await api.location.getMetrics(alias, startDate, endDate);
    metrics = parsePriceCheckMetrics(metricsRaw);
  } catch (err) {
    console.warn(`[price-check] Metrics failed for ${alias}: ${err}`);
  }

  // ── 3. Forecast (Claude agent with context) ──
  let forecast: ParsedForecast = deriveForecastFromComps(comparables, metrics);
  try {
    const agentResult = await runAgent(
      `You are a pricing analyst for AppointmentTrader restaurant reservations. You will be given comparable trade data and market metrics. Return ONLY a valid JSON object with no extra text, markdown, or explanation.`,
      `Given the following market data for "${alias}" on ${dt}:

Comparable trades: ${JSON.stringify(comparables)}
Market metrics (90d): ${JSON.stringify(metrics)}

Return ONLY this JSON (no markdown, no explanation):
{
  "recommendedPriceCents": <number — optimal listing price in cents>,
  "profitTargetCents": <number — expected profit in cents>,
  "demandLevel": "<High|Medium|Low>",
  "yoyChangePercent": <number — estimated year-over-year price change %>
}`,
      { sessionType: "price_check", locationAlias: alias },
    );

    // Extract JSON from agent response
    const jsonMatch = agentResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      forecast = {
        recommendedPriceCents: parseInt(parsed.recommendedPriceCents, 10) || forecast.recommendedPriceCents,
        profitTargetCents: parseInt(parsed.profitTargetCents, 10) || forecast.profitTargetCents,
        demandLevel: parsed.demandLevel || forecast.demandLevel,
        yoyChangePercent: parseFloat(parsed.yoyChangePercent) || forecast.yoyChangePercent,
      };
    }
  } catch (err) {
    console.warn(`[price-check] Agent forecast failed for ${alias}: ${err}`);
  }

  res.json({
    RequestStatus: "Succeeded",
    ResponseCode: 100,
    Payload: {
      comparables,
      metrics,
      forecast,
    },
  });
});
