/**
 * AT Edge Notification System
 *
 * Sends alerts via Telegram Bot API. No heavy SDK — just HTTP fetch.
 * Logs every notification to Neon for dedup and audit.
 */

import { hasDatabase, query, queryOne } from "./db/index.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

export type NotificationLevel = "info" | "warning" | "urgent" | "critical";

interface NotifyOptions {
  listingId?: string;
  eventType: string;
  level: NotificationLevel;
  message: string;
}

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function isNotifierConfigured(): boolean {
  return !!getTelegramConfig();
}

const LEVEL_PREFIX: Record<NotificationLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  urgent: "🚨",
  critical: "🔴",
};

async function sendTelegram(text: string): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("  [notifier] Telegram send failed:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("  [notifier] Telegram send error:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function wasAlreadySent(listingId: string | undefined, eventType: string): Promise<boolean> {
  if (!listingId || !hasDatabase()) return false;
  const row = await queryOne(
    `SELECT id FROM notification_log WHERE listing_id = $1 AND event_type = $2 AND sent_at > NOW() - INTERVAL '6 hours'`,
    [listingId, eventType]
  );
  return !!row;
}

async function logNotification(opts: NotifyOptions): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await query(
      `INSERT INTO notification_log (listing_id, event_type, message, channel) VALUES ($1, $2, $3, 'telegram')`,
      [opts.listingId ?? null, opts.eventType, opts.message]
    );
  } catch { /* non-critical */ }
}

export async function notify(opts: NotifyOptions): Promise<boolean> {
  if (await wasAlreadySent(opts.listingId, opts.eventType)) return false;

  const prefix = LEVEL_PREFIX[opts.level];
  const text = `${prefix} <b>AT Edge</b>\n${opts.message}`;
  const sent = await sendTelegram(text);

  if (sent) await logNotification(opts);
  return sent;
}

// ── Convenience helpers ──

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function formatDateShort(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}`;
  return dateStr;
}

export interface ListingInfo {
  listingID: string;
  locationName: string;
  locationAlias: string;
  dateTime: string;
  priceAmountInSmallestUnit: number;
  inventoryTypeName?: string;
  status?: string;
  popularityScoreBracket?: number;
}

export async function notifySold(listing: ListingInfo): Promise<boolean> {
  return notify({
    listingId: listing.listingID,
    eventType: "sold",
    level: "critical",
    message: `<b>SOLD</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} — ${listing.inventoryTypeName ?? "Reservation"} sold at ${formatPrice(listing.priceAmountInSmallestUnit)}`,
  });
}

export async function notifyNewBid(listing: ListingInfo, bidPriceCents: number): Promise<boolean> {
  return notify({
    listingId: listing.listingID,
    eventType: "new_bid",
    level: "warning",
    message: `<b>BID</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} — New bid at ${formatPrice(bidPriceCents)} (your ask: ${formatPrice(listing.priceAmountInSmallestUnit)})`,
  });
}

export async function notifyApproved(listing: ListingInfo): Promise<boolean> {
  return notify({
    listingId: listing.listingID,
    eventType: "approved",
    level: "info",
    message: `<b>LIVE</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} — Now visible on marketplace at ${formatPrice(listing.priceAmountInSmallestUnit)}`,
  });
}

export async function notifyDeadlineWarning(listing: ListingInfo, hoursLeft: number): Promise<boolean> {
  const isUrgent = hoursLeft <= 24;
  const timeLabel = hoursLeft <= 24 ? "TOMORROW" : `${Math.round(hoursLeft / 24)} days away`;
  const eventType = isUrgent ? "deadline_urgent" : "deadline_warning";

  return notify({
    listingId: listing.listingID,
    eventType,
    level: isUrgent ? "urgent" : "warning",
    message: isUrgent
      ? `<b>URGENT</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} is <b>${timeLabel}</b>. Cancel now or it will expire unsold.`
      : `<b>WARNING</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} is ${timeLabel}. Cancel deadline approaching.`,
  });
}

export async function notifyExpired(listing: ListingInfo): Promise<boolean> {
  return notify({
    listingId: listing.listingID,
    eventType: "expired",
    level: "critical",
    message: `<b>EXPIRED</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} expired unsold. Reservation may be forfeited.`,
  });
}

export async function notifyEngagement(listing: ListingInfo, oldScore: number, newScore: number): Promise<boolean> {
  return notify({
    listingId: listing.listingID,
    eventType: `engagement_${newScore}`,
    level: "info",
    message: `<b>ENGAGEMENT</b>: ${listing.locationName} ${formatDateShort(listing.dateTime)} — Popularity score jumped ${oldScore} → ${newScore}/10`,
  });
}
