/**
 * Chart Data API
 *
 * Serves pre-aggregated chart data from Neon for the trading terminal UI.
 * GET /api/chart-data/:alias?tf=6M
 *
 * Returns: { candles[], volume[], sma[], conversion[], demand[] }
 */

import { Router } from "express";
import { hasDatabase, queryMany } from "../db/index.js";

export const chartdataRoutes = Router();

interface OHLCRow {
  trade_day: string;
  open_cents: number;
  high_cents: number;
  low_cents: number;
  close_cents: number;
  volume: string; // COUNT returns string in pg
}

interface SnapshotRow {
  captured_at: string;
  data: { locations?: Record<string, number> };
}

const TIMEFRAME_DAYS: Record<string, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  ALL: 9999,
};

function calculateSMA(
  closes: { time: string; value: number }[],
  period: number,
): { time: string; value: number }[] {
  const sma: { time: string; value: number }[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j].value;
    }
    sma.push({
      time: closes[i].time,
      value: parseFloat((sum / period).toFixed(2)),
    });
  }
  return sma;
}

// GET /api/chart-data/:alias
chartdataRoutes.get("/:alias", async (req, res) => {
  const { alias } = req.params;
  const tf = (req.query.tf as string) ?? "6M";
  const days = TIMEFRAME_DAYS[tf] ?? 180;

  if (!hasDatabase()) {
    return res.json({
      status: "no_database",
      candles: [],
      volume: [],
      sma: [],
      conversion: [],
      demand: [],
    });
  }

  try {
    // 1. OHLC candles from daily_ohlc view
    const ohlcRows = await queryMany<OHLCRow>(
      `SELECT trade_day::text, open_cents, high_cents, low_cents, close_cents, volume
       FROM daily_ohlc
       WHERE location_alias = $1
         AND trade_day >= CURRENT_DATE - $2::integer
       ORDER BY trade_day ASC`,
      [alias, days],
    );

    const candles = ohlcRows.map(r => ({
      time: r.trade_day,
      open: r.open_cents / 100,
      high: r.high_cents / 100,
      low: r.low_cents / 100,
      close: r.close_cents / 100,
    }));

    const volume = ohlcRows.map(r => ({
      time: r.trade_day,
      value: parseInt(r.volume, 10),
      color:
        r.close_cents >= r.open_cents
          ? "rgba(34,197,94,0.15)"
          : "rgba(239,68,68,0.15)",
    }));

    // 2. SMA(20) from close prices
    const closes = candles.map(c => ({ time: c.time, value: c.close }));
    const sma = calculateSMA(closes, 20);

    // 3. Conversion rate time series from market_snapshots
    const convSnapshots = await queryMany<SnapshotRow>(
      `SELECT captured_at::text, data
       FROM market_snapshots
       WHERE snapshot_type = 'conversion_rates'
         AND captured_at >= CURRENT_DATE - $1::integer
       ORDER BY captured_at ASC`,
      [days],
    );

    const conversion = convSnapshots
      .map(s => {
        const val = s.data?.locations?.[alias];
        if (val == null) return null;
        return {
          time: s.captured_at.slice(0, 10),
          value: val,
        };
      })
      .filter(Boolean);

    // 4. Demand index time series from market_snapshots
    const demandSnapshots = await queryMany<SnapshotRow>(
      `SELECT captured_at::text, data
       FROM market_snapshots
       WHERE snapshot_type = 'demand_index'
         AND captured_at >= CURRENT_DATE - $1::integer
       ORDER BY captured_at ASC`,
      [days],
    );

    const demand = demandSnapshots
      .map(s => {
        const val = s.data?.locations?.[alias];
        if (val == null) return null;
        return {
          time: s.captured_at.slice(0, 10),
          value: parseFloat(val.toFixed(1)),
        };
      })
      .filter(Boolean);

    // 5. Summary stats
    const tradeCount = await queryMany<{ count: string }>(
      `SELECT COUNT(*) as count FROM trades WHERE location_alias = $1`,
      [alias],
    );

    res.json({
      status: "ok",
      alias,
      timeframe: tf,
      totalTrades: parseInt(tradeCount[0]?.count ?? "0", 10),
      candles,
      volume,
      sma,
      conversion,
      demand,
    });
  } catch (err) {
    console.error(`[chart-data] Error for ${alias}:`, err);
    res.status(500).json({
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      candles: [],
      volume: [],
      sma: [],
      conversion: [],
      demand: [],
    });
  }
});

// GET /api/chart-data — summary of all locations with data
chartdataRoutes.get("/", async (_req, res) => {
  if (!hasDatabase()) {
    return res.json({ status: "no_database", locations: [] });
  }

  try {
    const rows = await queryMany<{
      location_alias: string;
      trade_count: string;
      first_trade: string;
      last_trade: string;
    }>(
      `SELECT location_alias,
              COUNT(*) as trade_count,
              MIN(trade_date)::text as first_trade,
              MAX(trade_date)::text as last_trade
       FROM trades
       WHERE trade_date IS NOT NULL
       GROUP BY location_alias
       ORDER BY trade_count DESC`,
    );

    res.json({
      status: "ok",
      locations: rows.map(r => ({
        alias: r.location_alias,
        tradeCount: parseInt(r.trade_count, 10),
        firstTrade: r.first_trade,
        lastTrade: r.last_trade,
      })),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      locations: [],
    });
  }
});
