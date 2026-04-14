/**
 * AT Edge Portfolio Monitor
 *
 * Background job that polls the AT API for portfolio changes every 15 minutes.
 * Detects listing status changes (sold, approved, expired) and fires deadline
 * warnings when listings approach their reservation date.
 *
 * Modeled on the email-scanner dual-loop pattern.
 */

import { ATAPI } from "../src/api/index.js";
import { hasDatabase, query, queryOne, queryMany } from "./db/index.js";
import {
  isNotifierConfigured,
  notifySold,
  notifyApproved,
  notifyExpired,
  notifyDeadlineWarning,
  notifyEngagement,
  type ListingInfo,
} from "./notifier.js";

const POLL_INTERVAL_MS = 15 * 60_000; // 15 minutes
const INITIAL_DELAY_MS = 30_000;       // wait 30s after startup

let stopped = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { pollTimer = setTimeout(resolve, ms); });
}

interface SnapshotRow {
  listing_id: string;
  status: string | null;
  price_cents: number | null;
  popularity: number | null;
}

async function getSnapshot(listingId: string): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(
    `SELECT listing_id, status, price_cents, popularity FROM listing_snapshots WHERE listing_id = $1`,
    [listingId]
  );
}

async function upsertSnapshot(listing: ListingInfo): Promise<void> {
  await query(
    `INSERT INTO listing_snapshots (listing_id, status, price_cents, popularity, raw_data, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (listing_id) DO UPDATE SET
       status = EXCLUDED.status,
       price_cents = EXCLUDED.price_cents,
       popularity = EXCLUDED.popularity,
       raw_data = EXCLUDED.raw_data,
       last_seen_at = NOW()`,
    [
      listing.listingID,
      listing.status ?? null,
      listing.priceAmountInSmallestUnit,
      listing.popularityScoreBracket ?? null,
      JSON.stringify(listing),
    ]
  );
}

function parseLocalDate(dateStr: string): Date {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const dtm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (dtm) return new Date(+dtm[1], +dtm[2] - 1, +dtm[3], +dtm[4], +dtm[5]);
  return new Date(dateStr);
}

function hoursUntil(dateStr: string): number {
  const target = parseLocalDate(dateStr);
  return (target.getTime() - Date.now()) / (1000 * 60 * 60);
}

async function getDeadlineThresholds(listingId: string): Promise<{ warn: number; urgent: number }> {
  if (!hasDatabase()) return { warn: 72, urgent: 24 };
  const row = await queryOne<{ cancel_warn_hours: number; cancel_urgent_hours: number }>(
    `SELECT cancel_warn_hours, cancel_urgent_hours FROM listings WHERE at_listing_id = $1`,
    [listingId]
  );
  return {
    warn: row?.cancel_warn_hours ?? 72,
    urgent: row?.cancel_urgent_hours ?? 24,
  };
}

function normalizeListing(item: any, groupName?: string): ListingInfo {
  const scoreBracket = item.listingPopularityScoreBracket;
  return {
    listingID: item.listingID,
    locationAlias: item.locationAlias ?? "",
    locationName: (item.locationAlias ?? "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    dateTime: item.listingTime ?? item.listingDate ?? "",
    priceAmountInSmallestUnit: parseInt(item.listingCurrentAskingPrice ?? "0", 10),
    inventoryTypeName: item.inventoryTypeName ?? "",
    status: item.listingStatus ?? groupName ?? "",
    popularityScoreBracket: typeof scoreBracket === "object"
      ? parseInt(scoreBracket?.ScoreVersion1Bracket ?? "0", 10)
      : parseInt(String(scoreBracket ?? "0"), 10),
  };
}

async function checkListingChanges(listing: ListingInfo): Promise<void> {
  const prev = await getSnapshot(listing.listingID);

  if (!prev) {
    // First time we've seen this listing — just snapshot it
    if (listing.status === "Approved") {
      await notifyApproved(listing);
    }
    await upsertSnapshot(listing);
    return;
  }

  const prevStatus = (prev.status ?? "").toLowerCase();
  const newStatus = (listing.status ?? "").toLowerCase();

  // Status transitions
  if (prevStatus !== newStatus) {
    if (newStatus === "sold" || newStatus === "completed") {
      await notifySold(listing);
    } else if (newStatus === "approved" && prevStatus !== "approved") {
      await notifyApproved(listing);
    } else if (newStatus === "expired" || newStatus === "archived") {
      await notifyExpired(listing);
    }
  }

  // Engagement: popularity score increase
  const oldPop = prev.popularity ?? 0;
  const newPop = listing.popularityScoreBracket ?? 0;
  if (newPop > oldPop && newPop >= 5) {
    await notifyEngagement(listing, oldPop, newPop);
  }

  await upsertSnapshot(listing);
}

async function checkDeadlines(listing: ListingInfo): Promise<void> {
  const status = (listing.status ?? "").toLowerCase();
  if (status === "sold" || status === "completed" || status === "expired" || status === "archived") return;
  if (!listing.dateTime) return;

  const hours = hoursUntil(listing.dateTime);
  if (hours < 0) return; // already past

  const thresholds = await getDeadlineThresholds(listing.listingID);

  if (hours <= thresholds.urgent) {
    await notifyDeadlineWarning(listing, hours);
  } else if (hours <= thresholds.warn) {
    await notifyDeadlineWarning(listing, hours);
  }
}

async function pollPortfolio(): Promise<void> {
  try {
    const api = new ATAPI();
    const result = await api.portfolio.getListings({ getPopularityScoreBracket: true });

    const payload = result.Payload as any;
    const groups: any[] = payload?.KeyValueList ?? payload?.ResponseBody?.KeyValueList ?? [];

    let count = 0;
    for (const group of groups) {
      const items: any[] = group?.KeyValueList ?? [];
      for (const item of items) {
        const listing = normalizeListing(item, group.Name);
        await checkListingChanges(listing);
        await checkDeadlines(listing);
        count++;
      }
    }

    // Check for listings that disappeared (may have been sold/expired on AT side)
    if (hasDatabase()) {
      const currentIds = new Set<string>();
      for (const group of groups) {
        for (const item of (group?.KeyValueList ?? [])) {
          if (item.listingID) currentIds.add(item.listingID);
        }
      }

      const tracked = await queryMany<SnapshotRow>(
        `SELECT listing_id, status FROM listing_snapshots WHERE status NOT IN ('sold', 'completed', 'expired', 'archived') OR status IS NULL`
      );

      for (const row of tracked) {
        if (!currentIds.has(row.listing_id)) {
          // Listing disappeared from portfolio — likely sold or expired
          const ghost: ListingInfo = {
            listingID: row.listing_id,
            locationAlias: "",
            locationName: row.listing_id,
            dateTime: "",
            priceAmountInSmallestUnit: row.price_cents ?? 0,
            status: "sold",
          };
          await notifySold(ghost);
          await query(
            `UPDATE listing_snapshots SET status = 'sold', last_seen_at = NOW() WHERE listing_id = $1`,
            [row.listing_id]
          );
        }
      }
    }

    if (count > 0) {
      console.log(`  [monitor] Checked ${count} listings`);
    }
  } catch (err) {
    console.error("  [monitor] Poll failed:", err instanceof Error ? err.message : err);
  }
}

async function monitorLoop(): Promise<void> {
  await sleep(INITIAL_DELAY_MS);
  console.log("  [monitor] Running initial portfolio check...");
  await pollPortfolio();

  while (!stopped) {
    await sleep(POLL_INTERVAL_MS);
    if (stopped) break;
    await pollPortfolio();
  }
}

export function startPortfolioMonitor(): void {
  if (!process.env.AT_API_KEY) {
    console.log("  Monitor: DISABLED (no AT_API_KEY)");
    return;
  }
  if (!hasDatabase()) {
    console.log("  Monitor: DISABLED (no database)");
    return;
  }

  const telegramStatus = isNotifierConfigured() ? "Telegram configured" : "Telegram NOT configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)";
  console.log(`  Monitor: Scheduled (every 15 min) — ${telegramStatus}`);

  stopped = false;
  monitorLoop().catch(err => {
    console.error("  [monitor] Fatal error:", err instanceof Error ? err.message : err);
  });
}

export function stopPortfolioMonitor(): void {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
