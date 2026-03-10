#!/usr/bin/env tsx
/**
 * AT Edge Backfill Script
 *
 * One-time script to seed the Neon database with market data.
 * Run with: npm run backfill
 *
 * Steps:
 * 1. Register priority locations in DB
 * 2. Discover additional locations from AT toplist
 * 3. Collect market ranking snapshots (demand, bid/ask, underserved, etc.)
 * 4. Pull comparable trades for future dates (AT API requires future dates)
 * 5. Report results
 */

import dotenv from "dotenv";
dotenv.config();

import { ATAPI } from "../src/api/index.js";
import { hasDatabase, query } from "./db/index.js";
import {
  discoverLocations,
  collectTradesForLocation,
  generateFutureDateRange,
  collectMarketRankings,
  getInventoryTypes,
} from "./collector.js";
import { upsertLocation } from "./db/memory.js";

// Known high-value locations to ensure we always collect
const PRIORITY_LOCATIONS = [
  { alias: "carbone-new-york", name: "Carbone", city: "New York" },
  { alias: "the-french-laundry-yountville", name: "French Laundry", city: "Yountville" },
  { alias: "nobu-malibu", name: "Nobu Malibu", city: "Malibu" },
  { alias: "le-bernardin-new-york", name: "Le Bernardin", city: "New York" },
  { alias: "don-angie-new-york", name: "Don Angie", city: "New York" },
  { alias: "4-charles-prime-rib-new-york", name: "4 Charles Prime Rib", city: "New York" },
  // Note: "rao-s-new-york" is not a valid AT alias — Rao's may not be on the platform
  { alias: "lilia-new-york", name: "Lilia", city: "New York" },
  { alias: "eleven-madison-park-new-york", name: "Eleven Madison Park", city: "New York" },
  { alias: "masa-new-york", name: "Masa", city: "New York" },
  { alias: "sw-steakhouse", name: "SW Steakhouse", city: "Las Vegas" },
  { alias: "steak-48-beverly-hills", name: "Steak 48", city: "Beverly Hills" },
];

async function main() {
  console.log("\n  ╔══════════════════════════════════════╗");
  console.log("  ║   AT Edge — Market Data Backfill      ║");
  console.log("  ╚══════════════════════════════════════╝\n");

  if (!process.env.AT_API_KEY) {
    console.error("  ERROR: AT_API_KEY not set in .env");
    process.exit(1);
  }

  if (!hasDatabase()) {
    console.error("  ERROR: DATABASE_URL not set in .env");
    process.exit(1);
  }

  const api = new ATAPI();
  const startTime = Date.now();
  let totalTrades = 0;
  let totalSnapshots = 0;
  let totalLocations = 0;
  const errors: string[] = [];

  // ── Step 1: Upsert priority locations ──
  console.log("  Step 1: Registering priority locations...");
  for (const loc of PRIORITY_LOCATIONS) {
    try {
      await upsertLocation(loc.alias, loc.name, loc.city);
      totalLocations++;
    } catch (err) {
      console.warn(`    Skipped ${loc.alias}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`    Registered ${totalLocations} priority locations\n`);

  // ── Step 2: Discover additional locations from market data ──
  console.log("  Step 2: Discovering locations from market data...");
  let discoveredLocations: Array<{ alias: string; name: string; city?: string; inventoryTypeIds: number[] }> = [];
  try {
    discoveredLocations = await discoverLocations(api);
    totalLocations += discoveredLocations.length;
    console.log(`    Discovered ${discoveredLocations.length} locations from AT API\n`);
  } catch (err) {
    const msg = `Location discovery failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    console.warn(`    ${msg}\n`);
  }

  // ── Step 3: Collect market ranking snapshots ──
  console.log("  Step 3: Collecting market ranking snapshots...");
  try {
    const rankings = await collectMarketRankings(api);
    totalSnapshots += rankings.snapshotCount;
    console.log(`    Stored ${rankings.snapshotCount} snapshots`);
    console.log(`    Demand data for ${Object.keys(rankings.demandMap).length} locations`);
    console.log(`    Location data for ${Object.keys(rankings.locationMap).length} locations\n`);
  } catch (err) {
    const msg = `Market rankings failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    console.warn(`    ${msg}\n`);
  }

  // ── Step 4: Collect comparable trades for future dates ──
  // AT API requires future dates for comparable trades
  const futureDays = 60;
  const dates = generateFutureDateRange(futureDays);
  console.log(`  Step 4: Collecting comparable trades (next ${futureDays} days)...`);
  console.log(`    Date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log("    This may take several minutes due to API rate limiting.\n");

  // Merge priority + discovered locations, deduplicate
  const allLocations = new Map<string, { alias: string; name: string; inventoryTypeId: number }>();

  for (const loc of PRIORITY_LOCATIONS) {
    allLocations.set(loc.alias, { alias: loc.alias, name: loc.name, inventoryTypeId: 2 });
  }

  for (const loc of discoveredLocations) {
    if (!allLocations.has(loc.alias)) {
      allLocations.set(loc.alias, {
        alias: loc.alias,
        name: loc.name,
        inventoryTypeId: loc.inventoryTypeIds[0] ?? 2,
      });
    }
  }

  // Try to discover inventory types for priority locations too
  for (const loc of PRIORITY_LOCATIONS) {
    try {
      const types = await getInventoryTypes(api, loc.alias);
      if (types.length > 0) {
        allLocations.set(loc.alias, { ...allLocations.get(loc.alias)!, inventoryTypeId: types[0] });
      }
      await new Promise(r => setTimeout(r, 200));
    } catch { /* use default */ }
  }

  const locationList = Array.from(allLocations.values());
  console.log(`    Collecting trades for ${locationList.length} locations...\n`);

  for (let i = 0; i < locationList.length; i++) {
    const loc = locationList[i];
    const progress = `[${i + 1}/${locationList.length}]`;
    process.stdout.write(`    ${progress} ${loc.alias}...`);

    try {
      const stored = await collectTradesForLocation(api, loc.alias, loc.name, loc.inventoryTypeId, dates);
      totalTrades += stored;
      console.log(` ${stored} trades`);
    } catch (err) {
      const msg = `${loc.alias}: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
      console.log(` FAILED (${err instanceof Error ? err.message : err})`);
    }
  }

  // ── Step 5: Verify data ──
  console.log("\n  Step 5: Verifying stored data...");
  try {
    const tradeCount = await query("SELECT COUNT(*) as count FROM trades");
    const locationCount = await query("SELECT COUNT(*) as count FROM locations");
    const snapshotCount = await query("SELECT COUNT(*) as count FROM market_snapshots");

    console.log(`    Trades in DB:     ${tradeCount.rows[0].count}`);
    console.log(`    Locations in DB:  ${locationCount.rows[0].count}`);
    console.log(`    Snapshots in DB:  ${snapshotCount.rows[0].count}`);

    // Try OHLC view (may not exist yet if migration hasn't run)
    try {
      const ohlcCount = await query("SELECT COUNT(*) as count FROM daily_ohlc");
      console.log(`    OHLC days in DB:  ${ohlcCount.rows[0].count}`);
    } catch {
      console.log(`    OHLC view:        not yet created (run migration)`);
    }

    // Show per-location breakdown
    const perLocation = await query(
      `SELECT location_alias, COUNT(*) as cnt, MIN(trade_date)::text as first, MAX(trade_date)::text as last
       FROM trades WHERE trade_date IS NOT NULL
       GROUP BY location_alias ORDER BY cnt DESC LIMIT 20`
    );
    if (perLocation.rows.length > 0) {
      console.log("\n    Per-location trade breakdown:");
      for (const row of perLocation.rows) {
        console.log(`      ${row.location_alias}: ${row.cnt} trades (${row.first?.slice(0, 10) ?? "?"} → ${row.last?.slice(0, 10) ?? "?"})`);
      }
    }
  } catch (err) {
    console.warn(`    Verification error: ${err instanceof Error ? err.message : err}`);
  }

  // ── Summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n  ────────────────────────────────────");
  console.log("  BACKFILL COMPLETE");
  console.log("  ────────────────────────────────────");
  console.log(`    Trades stored:    ${totalTrades}`);
  console.log(`    Snapshots stored: ${totalSnapshots}`);
  console.log(`    Locations:        ${totalLocations}`);
  console.log(`    Errors:           ${errors.length}`);
  console.log(`    Duration:         ${elapsed}s`);

  if (errors.length > 0) {
    console.log("\n  Errors:");
    for (const err of errors.slice(0, 10)) {
      console.log(`    - ${err}`);
    }
    if (errors.length > 10) {
      console.log(`    ... and ${errors.length - 10} more`);
    }
  }

  console.log("");
  process.exit(0);
}

main().catch(err => {
  console.error("  FATAL:", err);
  process.exit(1);
});
