/**
 * Gmail IMAP client using ImapFlow + App Password.
 *
 * No OAuth, no Google Cloud Console, no refresh tokens.
 * Requires: GMAIL_USER + GMAIL_APP_PASSWORD env vars.
 *
 * Setup (one-time, 60 seconds):
 *   1. Go to myaccount.google.com/security
 *   2. Enable 2-Step Verification
 *   3. Search "App passwords" → create one named "AT Edge"
 *   4. Set GMAIL_USER=your@gmail.com GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
 */

import { ImapFlow } from "imapflow";

export interface RawEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;  // first 400 chars — used for Claude triage
  body: string;     // full text — used for Claude import parse
}

function createClient(): ImapFlow {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER ?? "",
      pass: process.env.GMAIL_APP_PASSWORD ?? "",
    },
    logger: false, // suppress verbose IMAP protocol logs
  });
}

export function isImapConfigured(): boolean {
  const user = process.env.GMAIL_USER ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  return user.includes("@") && pass.length >= 16;
}

/**
 * Extract readable text from a raw RFC 822 email source.
 * Handles plain text, HTML, and MIME multipart in a single pass.
 */
function extractBodyText(source: string): string {
  // If there's a MIME boundary, try to find text/plain part
  const plainTextMatch = source.match(
    /Content-Type:\s*text\/plain[^\n]*\n(?:[^\n]+\n)*?\n([\s\S]*?)(?=\n--|\n\nContent-Type:|$)/i
  );
  if (plainTextMatch?.[1]) {
    return decodeMailBody(plainTextMatch[1]).slice(0, 6000);
  }

  // Fall back to HTML body — strip tags
  const bodyStart = source.indexOf("\r\n\r\n");
  const rawBody = bodyStart >= 0 ? source.slice(bodyStart + 4) : source;
  return rawBody
    .replace(/<[^>]*>/g, " ")      // strip HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

/** Decode quoted-printable and base64 MIME transfer encodings */
function decodeMailBody(text: string): string {
  // Decode quoted-printable (=XX hex sequences)
  return text
    .replace(/=\r?\n/g, "")  // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Fetch emails that arrived since a given date.
 * Opens a fresh connection, searches, fetches, and disconnects.
 */
export async function fetchEmailsSince(sinceDate: Date): Promise<RawEmail[]> {
  const client = createClient();
  const emails: RawEmail[] = [];

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    const uids = await client.search({ since: sinceDate }, { uid: true });
    if (!uids || uids.length === 0) return [];

    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      source: true,
    }, { uid: true })) {
      const envelope = msg.envelope;
      const subject = envelope?.subject ?? "(no subject)";
      const fromAddr = envelope?.from?.[0];
      const from = fromAddr
        ? `${fromAddr.name ?? ""} <${fromAddr.address ?? ""}>`.trim()
        : "";
      const date = envelope?.date?.toISOString() ?? new Date().toISOString();
      const uid = msg.uid;
      const messageId = envelope?.messageId ?? `uid-${uid}-${Date.now()}`;

      const source = msg.source
        ? (Buffer.isBuffer(msg.source)
            ? msg.source.toString("utf-8")
            : String(msg.source))
        : "";

      const body = extractBodyText(source);
      const snippet = body.slice(0, 400);

      emails.push({ uid, messageId, subject, from, date, snippet, body });
    }
  } finally {
    lock.release();
    try { await client.logout(); } catch { /* ignore logout errors */ }
  }

  return emails;
}

/**
 * Fetch a single email by UID (used when IDLE notifies about a specific new message).
 */
export async function fetchEmailByUid(uid: number): Promise<RawEmail | null> {
  const client = createClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    let found: RawEmail | null = null;

    for await (const msg of client.fetch(String(uid), {
      uid: true,
      envelope: true,
      source: true,
    }, { uid: true })) {
      const envelope = msg.envelope;
      const subject = envelope?.subject ?? "(no subject)";
      const fromAddr = envelope?.from?.[0];
      const from = fromAddr
        ? `${fromAddr.name ?? ""} <${fromAddr.address ?? ""}>`.trim()
        : "";
      const date = envelope?.date?.toISOString() ?? new Date().toISOString();
      const messageId = envelope?.messageId ?? `uid-${uid}-${Date.now()}`;

      const source = msg.source
        ? (Buffer.isBuffer(msg.source)
            ? msg.source.toString("utf-8")
            : String(msg.source))
        : "";

      const body = extractBodyText(source);
      found = { uid, messageId, subject, from, date, snippet: body.slice(0, 400), body };
    }

    return found;
  } finally {
    lock.release();
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Create an IMAP IDLE client that stays connected and emits events.
 * Caller is responsible for reconnection (see email-scanner.ts).
 */
export function createIdleClient(): ImapFlow {
  return createClient();
}
