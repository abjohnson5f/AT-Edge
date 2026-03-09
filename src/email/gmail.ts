import { google } from "googleapis";
import { config } from "../config.js";

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  body: string;
  from: string;
  date: string;
}

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret
  );
  oauth2.setCredentials({ refresh_token: config.gmail.refreshToken });
  return oauth2;
}

async function getLabelId(
  gmail: ReturnType<typeof google.gmail>,
  labelName: string
): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const label = res.data.labels?.find((l) => l.name === labelName);
  return label?.id ?? null;
}

async function createLabel(
  gmail: ReturnType<typeof google.gmail>,
  labelName: string
): Promise<string> {
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return res.data.id!;
}

export async function getUnprocessedEmails(): Promise<GmailMessage[]> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const importLabelId = await getLabelId(gmail, config.gmail.importLabel);
  if (!importLabelId) {
    console.log(
      `Label "${config.gmail.importLabel}" not found. Create it in Gmail and forward reservation emails there.`
    );
    return [];
  }

  const processedLabelId = await getLabelId(gmail, config.gmail.processedLabel);

  // Get messages with import label but without processed label
  let query = `label:${config.gmail.importLabel}`;
  if (processedLabelId) {
    query += ` -label:${config.gmail.processedLabel}`;
  }

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  if (!res.data.messages?.length) return [];

  const messages: GmailMessage[] = [];

  for (const msg of res.data.messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    const headers = full.data.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";

    // Extract body text from the message parts
    const body = extractBody(full.data.payload);

    messages.push({
      id: msg.id!,
      threadId: msg.threadId!,
      subject,
      body,
      from,
      date,
    });
  }

  return messages;
}

function extractBody(payload: any): string {
  if (!payload) return "";

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const textPart = payload.parts.find(
      (p: any) => p.mimeType === "text/plain"
    );
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }

    const htmlPart = payload.parts.find(
      (p: any) => p.mimeType === "text/html"
    );
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, "base64url").toString(
        "utf-8"
      );
      // Strip HTML tags for basic text extraction
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Recursively check nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

export async function markAsProcessed(messageId: string): Promise<void> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  let processedLabelId = await getLabelId(gmail, config.gmail.processedLabel);
  if (!processedLabelId) {
    processedLabelId = await createLabel(gmail, config.gmail.processedLabel);
  }

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [processedLabelId],
    },
  });
}
