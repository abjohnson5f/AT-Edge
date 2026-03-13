/**
 * AT Edge — Intelligent Email Scanner
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  IDLE Watcher (persistent IMAP IDLE connection)          │
 *   │  - Reconnects with exponential backoff after drops       │
 *   │  - Gmail cuts IDLE after ~29 min; we reconnect instantly │
 *   │  - Sets needsScan=true on EXISTS notification            │
 *   └────────────────────┬────────────────────────────────────┘
 *                        │ needsScan flag
 *   ┌────────────────────▼────────────────────────────────────┐
 *   │  Processing Loop (separate, independent)                  │
 *   │  - Checks flag every 30s; also fires every 15 min        │
 *   │  - Opens fresh IMAP connection → fetch since lastScan    │
 *   │  - Claude triage: classify which are reservations        │
 *   │  - Auto-import each reservation (parse + price + store)  │
 *   └─────────────────────────────────────────────────────────┘
 *
 * If IDLE drops repeatedly, polling every 15 min is the fallback.
 * IDLE provides near-real-time notification (seconds), polling is
 * the safety net.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createIdleClient, fetchEmailsSince, isImapConfigured } from "../src/email/gmail.js";
import type { RawEmail } from "../src/email/gmail.js";
import { runAgent } from "./agent.js";
import { hasDatabase, query, queryOne, recordImport, upsertLocation } from "./db/index.js";

// ── Constants ──────────────────────────────────────────────────────────────

const MIN_BACKOFF_MS = 5_000;          // 5s
const MAX_BACKOFF_MS = 5 * 60_000;    // 5 min
const POLL_INTERVAL_MS = 15 * 60_000; // 15 min fallback poll
const IDLE_CHECK_MS = 30_000;         // check needsScan every 30s
const INITIAL_SCAN_DELAY_MS = 15_000; // wait 15s after startup before first scan
const SCAN_LOOKBACK_HOURS = 600;      // on startup, scan back ~25 days (to 02/15/2026)

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

// ── State ──────────────────────────────────────────────────────────────────

let stopped = false;
let needsScan = false;
let lastScanTime = new Date(Date.now() - SCAN_LOOKBACK_HOURS * 60 * 60 * 1000);
let scanInProgress = false;
let idleConnected = false;
let consecutiveIdleFailures = 0;
let totalEmailsProcessed = 0;
let totalReservationsFound = 0;
let lastError: string | null = null;

// ── Import System Prompt (same as manual import route) ─────────────────────

const IMPORT_SYSTEM = `You are AT Edge Importer, an intelligent reservation import agent for AppointmentTrader.

Your job is to take a forwarded reservation confirmation email and:
1. Parse it into structured data (restaurant name, date, time, party size, contact info)
2. Search for the matching location on AppointmentTrader
3. Get inventory types for the location
4. Get comparable trades for intelligent pricing
5. Recommend an optimal listing price

Return your final response as a JSON object (no markdown fencing) with this exact structure:
{
  "parsed": {
    "restaurantName": "string",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "partySize": number,
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "confirmationNumber": "string or empty",
    "specialNotes": "string or empty"
  },
  "locationMatch": { "alias": "string", "name": "string" } | null,
  "inventoryTypeID": number,
  "pricing": {
    "recommendedPriceCents": number,
    "priceRangeMinCents": number,
    "priceRangeMaxCents": number,
    "reasoning": "string explaining the pricing logic"
  },
  "comparableTradesCount": number
}

If you cannot find a matching location, set locationMatch to null and still return the parsed data.
If you cannot get comparable trades, use reasonable estimates based on the restaurant type and market.`;

// ── Public API ─────────────────────────────────────────────────────────────

export interface ScannerStatus {
  configured: boolean;
  running: boolean;
  idleConnected: boolean;
  lastScanTime: string;
  scanInProgress: boolean;
  consecutiveIdleFailures: number;
  totalEmailsProcessed: number;
  totalReservationsFound: number;
  lastError: string | null;
}

export function getScannerStatus(): ScannerStatus {
  return {
    configured: isImapConfigured(),
    running: !stopped,
    idleConnected,
    lastScanTime: lastScanTime.toISOString(),
    scanInProgress,
    consecutiveIdleFailures,
    totalEmailsProcessed,
    totalReservationsFound,
    lastError,
  };
}

/** Trigger an immediate scan (e.g. from "Scan Now" UI button) */
export async function triggerScanNow(): Promise<{ scanned: number; reservations: number }> {
  if (!isImapConfigured()) {
    throw new Error("Gmail IMAP not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  needsScan = true;
  const before = { emails: totalEmailsProcessed, res: totalReservationsFound };
  await runScan();
  return {
    scanned: totalEmailsProcessed - before.emails,
    reservations: totalReservationsFound - before.res,
  };
}

/** Start the IMAP IDLE watcher + processing loop */
export function startEmailScanner(): void {
  if (!isImapConfigured()) {
    console.log("  Email Scanner: NOT CONFIGURED (set GMAIL_USER + GMAIL_APP_PASSWORD)");
    return;
  }

  stopped = false;
  console.log("  Email Scanner: Starting (IMAP IDLE + 15-min fallback poll)");

  // Start both loops independently — if one crashes, the other survives
  idleWatcherLoop().catch(err => {
    console.error("  [scanner] IDLE watcher crashed:", err?.message ?? err);
  });

  processingLoop().catch(err => {
    console.error("  [scanner] Processing loop crashed:", err?.message ?? err);
  });
}

/** Graceful shutdown */
export function stopEmailScanner(): void {
  stopped = true;
  console.log("  Email Scanner: Stopping");
}

// ── IDLE Watcher ───────────────────────────────────────────────────────────
// Maintains a persistent IMAP IDLE connection to Gmail.
// When Gmail notifies us of new mail (EXISTS), sets needsScan=true.
// Reconnects with exponential backoff when the connection drops.
// Gmail enforces a 29-minute IDLE max; we reconnect immediately after.

async function idleWatcherLoop(): Promise<void> {
  let backoffMs = MIN_BACKOFF_MS;

  while (!stopped) {
    const client = createIdleClient();
    let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;

    try {
      await client.connect();

      client.on("exists", (data: { count: number; prevCount: number }) => {
        if (data.count > data.prevCount) {
          console.log(`  [scanner] IDLE: ${data.count - data.prevCount} new message(s) — queuing scan`);
          needsScan = true;
        }
      });

      client.on("close", () => {
        idleConnected = false;
      });

      lock = await client.getMailboxLock("INBOX");
      idleConnected = true;
      consecutiveIdleFailures = 0;
      backoffMs = MIN_BACKOFF_MS; // reset on successful connect

      // idle() blocks until Gmail drops the connection (~29 min) or an error occurs
      await client.idle();

    } catch (err) {
      consecutiveIdleFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `IDLE: ${msg}`;

      if (consecutiveIdleFailures <= 3) {
        console.warn(`  [scanner] IDLE connection lost (${msg}) — reconnecting in ${backoffMs / 1000}s`);
      }

      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);

    } finally {
      idleConnected = false;
      if (lock) {
        try { lock.release(); } catch { /* ignore */ }
      }
      try { await client.logout(); } catch { /* ignore */ }
    }

    if (!stopped) {
      await sleep(backoffMs);
    }
  }
}

// ── Processing Loop ────────────────────────────────────────────────────────
// Checks needsScan flag every 30s.
// Also fires unconditionally every 15 minutes as a safety net.
// Each scan opens a fresh IMAP connection, fetches since lastScanTime,
// triages with Claude, and auto-imports any reservations found.

async function processingLoop(): Promise<void> {
  // Initial startup scan — catch any emails from last 48h that arrived while server was down
  await sleep(INITIAL_SCAN_DELAY_MS);
  console.log("  [scanner] Running startup scan (last 48h)...");
  await runScan();

  while (!stopped) {
    await sleep(IDLE_CHECK_MS);

    if (stopped) break;

    const msSinceLastScan = Date.now() - lastScanTime.getTime();
    const shouldScan = needsScan || msSinceLastScan >= POLL_INTERVAL_MS;

    if (shouldScan && !scanInProgress) {
      needsScan = false;
      await runScan();
    }
  }
}

// ── Core Scan ──────────────────────────────────────────────────────────────

async function runScan(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;

  const scanStart = lastScanTime;
  const scanStartedAt = new Date();

  try {
    console.log(`  [scanner] Scanning inbox since ${scanStart.toLocaleString()}...`);

    const emails = await fetchEmailsSince(scanStart);
    totalEmailsProcessed += emails.length;

    if (emails.length === 0) {
      console.log("  [scanner] No new emails");
      lastScanTime = scanStartedAt;
      return;
    }

    console.log(`  [scanner] Found ${emails.length} email(s) — triaging with Claude...`);

    // Filter out duplicates that are already in the DB
    const fresh = await deduplicateEmails(emails);
    if (fresh.length === 0) {
      console.log("  [scanner] All emails already processed");
      lastScanTime = scanStartedAt;
      return;
    }

    // Claude triage: which are reservation confirmations?
    const reservationEmails = await triageEmails(fresh);

    if (reservationEmails.length === 0) {
      console.log(`  [scanner] No reservations in ${fresh.length} email(s)`);
      lastScanTime = scanStartedAt;
      return;
    }

    console.log(`  [scanner] Found ${reservationEmails.length} reservation(s) — auto-importing...`);
    totalReservationsFound += reservationEmails.length;

    // Auto-import each reservation
    for (const email of reservationEmails) {
      try {
        await processReservationEmail(email);
        console.log(`  [scanner] ✓ Imported: "${email.subject}" from ${email.from}`);
      } catch (err) {
        console.error(`  [scanner] ✗ Failed to import "${email.subject}":`, err instanceof Error ? err.message : err);
      }
    }

    lastScanTime = scanStartedAt;
    lastError = null;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastError = `Scan: ${msg}`;
    console.error("  [scanner] Scan failed:", msg);
  } finally {
    scanInProgress = false;
  }
}

// ── Claude Triage ──────────────────────────────────────────────────────────
// Sends a batch of email metadata to Claude for reservation classification.
// Costs ~1-3k tokens per scan. Returns the emails identified as reservations.

async function triageEmails(emails: RawEmail[]): Promise<RawEmail[]> {
  if (emails.length === 0) return [];

  // Pre-filter: emails with very short bodies can't be reservation confirmations.
  // A real confirmation always has date, time, restaurant name, and guest name.
  const candidates = emails.filter(e => e.body.length >= 100);
  if (candidates.length === 0) return [];

  // Build a concise summary for each email (subject + sender + 400-char snippet)
  const emailSummaries = candidates.map((e, i) =>
    `[${i}] From: ${e.from}\n    Subject: ${e.subject}\n    Preview: ${e.snippet.slice(0, 400)}`
  ).join("\n\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `You are classifying emails to find restaurant reservation confirmations that contain enough detail to create a listing.

A qualifying email MUST:
1. Confirm a specific restaurant reservation (not a reminder, not a cancellation)
2. Contain the guest name, date, time, and party size
3. Come from a booking platform (Resy, OpenTable, Tock, SevenRooms, Yelp, Exploretock, Reserve, Opentable) or directly from a restaurant

Do NOT include:
- Test emails, blank emails, or emails with no reservation details
- Marketing emails, newsletters, promotional offers
- Cancellation or modification confirmations
- Food delivery order confirmations
- Generic "booking received" notifications without guest/date/time details
- Reminder emails for reservations already confirmed

Emails to classify:
${emailSummaries}

Return ONLY a JSON array of the numeric indices (0-based) of emails that qualify.
If none qualify, return: []
Return only the JSON array, no explanation.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]";

  let indices: number[] = [];
  try {
    const parsed = JSON.parse(text);
    indices = Array.isArray(parsed) ? parsed.filter(n => typeof n === "number") : [];
  } catch {
    const numbers = text.match(/\d+/g);
    indices = numbers ? numbers.map(Number).filter(n => n < candidates.length) : [];
  }

  return indices.map(i => candidates[i]).filter(Boolean);
}

// ── Auto-Import Pipeline ───────────────────────────────────────────────────
// Runs the full import agent on a single reservation email.
// Stores result in Neon with status 'auto_queued' for UI review.

async function processReservationEmail(email: RawEmail): Promise<void> {
  const bodyHash = createHash("sha256").update(email.body).digest("hex");

  // Double-check dedup
  if (hasDatabase()) {
    const existing = await queryOne<{ id: number }>(
      "SELECT id FROM imports WHERE email_body_hash = $1",
      [bodyHash]
    );
    if (existing) return;
  }

  // Run the full import agent (parse + AT location match + comparable trades + pricing)
  const result = await runAgent(
    IMPORT_SYSTEM,
    `Parse this reservation confirmation email, find the matching AppointmentTrader location, get comparable trades, and recommend a listing price.

Subject: ${email.subject}
From: ${email.from}
Date: ${email.date}

Email Body:
${email.body}

Today's date: ${new Date().toLocaleDateString("en-US")}`,
    { sessionType: "import" }
  );

  // Parse the agent's JSON response
  let importData: Record<string, unknown>;
  try {
    const cleaned = result.text
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    importData = JSON.parse(cleaned);
  } catch {
    const firstBrace = result.text.indexOf("{");
    const lastBrace = result.text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        importData = JSON.parse(result.text.slice(firstBrace, lastBrace + 1));
      } catch {
        importData = { rawAnalysis: result.text };
      }
    } else {
      importData = { rawAnalysis: result.text };
    }
  }

  // Only queue items where the agent actually produced a parsed reservation object.
  // rawAnalysis-only results (agent couldn't parse the email) are discarded here —
  // they would show up as empty/confusing entries in the UI.
  const parsedObj = importData.parsed as Record<string, unknown> | undefined;
  if (!parsedObj?.restaurantName) {
    console.log(`  [scanner] Skipping "${email.subject}" — agent couldn't parse reservation details`);
    return;
  }

  // Store in Neon with status 'auto_queued' (user will review in the UI)
  if (hasDatabase()) {
    const alias = (importData.locationMatch as Record<string, unknown> | null)?.alias as string | undefined;

    const importId = await recordImport({
      emailSubject: email.subject,
      emailBodyHash: bodyHash,
      parsedData: { ...importData, _emailFrom: email.from, _emailDate: email.date },
      locationAlias: alias,
      locationMatched: !!alias,
      recommendedPrice: (importData.pricing as Record<string, number> | null)?.recommendedPriceCents,
      agentReasoning: (importData.pricing as Record<string, string> | null)?.reasoning,
      sessionId: result.sessionId,
    });

    // Mark as auto_queued for UI differentiation
    await query(
      "UPDATE imports SET status = 'auto_queued' WHERE id = $1",
      [importId]
    );

    // Upsert location entity for memory
    if (alias) {
      const locationName = (importData.locationMatch as Record<string, unknown>)?.name as string ?? alias;
      await upsertLocation(alias, locationName);
    }
  }
}

// ── Deduplication ──────────────────────────────────────────────────────────
// Filter out emails whose body hash is already in the imports table.

async function deduplicateEmails(emails: RawEmail[]): Promise<RawEmail[]> {
  if (!hasDatabase() || emails.length === 0) return emails;

  const hashes = emails.map(e => createHash("sha256").update(e.body).digest("hex"));

  const existing = await query<{ email_body_hash: string }>(
    `SELECT email_body_hash FROM imports
     WHERE email_body_hash = ANY($1::text[])`,
    [hashes]
  );

  const existingSet = new Set(existing.rows.map(r => r.email_body_hash));

  return emails.filter((_, i) => !existingSet.has(hashes[i]));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
