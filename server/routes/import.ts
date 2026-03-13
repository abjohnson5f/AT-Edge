import { Router } from "express";
import { createHash } from "crypto";
import { runAgent } from "../agent.js";
import { hasDatabase, query, queryMany, recordImport, upsertLocation } from "../db/index.js";
import { triggerScanNow, getScannerStatus } from "../email-scanner.js";

export const importRoutes = Router();

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

// ── POST /api/import/parse ─────────────────────────────────────────────────
// Manual paste: parse an email and get pricing (unchanged from before)

importRoutes.post("/parse", async (req, res) => {
  const { subject, body } = req.body;

  if (!body) {
    return res.status(400).json({
      RequestStatus: "Failed",
      ResponseMessage: "Email body is required",
    });
  }

  try {
    const result = await runAgent(
      IMPORT_SYSTEM,
      `Parse this forwarded reservation confirmation email and find the matching AppointmentTrader location, get comparable trades, and recommend a listing price.

Subject: ${subject ?? "(no subject)"}

Email Body:
${body}

Today's date: ${new Date().toLocaleDateString("en-US")}`,
      { sessionType: "import" },
    );

    let importData;
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

    if (hasDatabase()) {
      try {
        const bodyHash = createHash("sha256").update(body).digest("hex");
        const alias = importData.locationMatch?.alias;

        await recordImport({
          emailSubject: subject,
          emailBodyHash: bodyHash,
          parsedData: importData.parsed ?? importData,
          locationAlias: alias,
          locationMatched: !!alias,
          recommendedPrice: importData.pricing?.recommendedPriceCents,
          agentReasoning: importData.pricing?.reasoning,
          sessionId: result.sessionId,
        });

        if (alias && importData.locationMatch?.name) {
          await upsertLocation(alias, importData.locationMatch.name);
        }
      } catch {
        // Memory persistence is optional
      }
    }

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        ...importData,
        toolCalls: result.toolCalls,
        sessionId: result.sessionId,
      },
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── GET /api/import/queue ──────────────────────────────────────────────────
// Returns auto-imported reservations waiting for user review.
// Items with status='auto_queued' are from the scanner.
// Items with status='parsed' are from manual imports.

importRoutes.get("/queue", async (_req, res) => {
  if (!hasDatabase()) {
    return res.json({
      RequestStatus: "Succeeded",
      Payload: { items: [] },
    });
  }

  try {
    const items = await queryMany<{
      id: number;
      email_subject: string;
      parsed_data: unknown;
      location_alias: string | null;
      location_matched: boolean;
      recommended_price: number | null;
      agent_reasoning: string | null;
      status: string;
      created_at: string;
    }>(
      `SELECT id, email_subject, parsed_data, location_alias, location_matched,
              recommended_price, agent_reasoning, status, created_at
       FROM imports
       WHERE status IN ('auto_queued', 'parsed')
       AND (
         parsed_data->>'restaurantName' IS NOT NULL
         OR parsed_data->'parsed'->>'restaurantName' IS NOT NULL
       )
       ORDER BY created_at DESC
       LIMIT 50`
    );

    res.json({
      RequestStatus: "Succeeded",
      Payload: { items, count: items.length },
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── POST /api/import/scan-now ──────────────────────────────────────────────
// Triggers an immediate inbox scan. UI "Scan Now" button calls this.

importRoutes.post("/scan-now", async (_req, res) => {
  try {
    const result = await triggerScanNow();
    res.json({
      RequestStatus: "Succeeded",
      Payload: result,
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── GET /api/import/scanner-status ────────────────────────────────────────
// Returns the email scanner's current state for the UI status indicator.

importRoutes.get("/scanner-status", (_req, res) => {
  res.json({
    RequestStatus: "Succeeded",
    Payload: getScannerStatus(),
  });
});

// ── POST /api/import/queue/:id/dismiss ────────────────────────────────────
// Dismisses an auto-imported item (marks it 'skipped').

importRoutes.post("/queue/:id/dismiss", async (req, res) => {
  const { id } = req.params;
  if (!hasDatabase()) {
    return res.json({ RequestStatus: "Succeeded" });
  }

  try {
    await query(
      "UPDATE imports SET status = 'skipped' WHERE id = $1",
      [parseInt(id, 10)]
    );
    res.json({ RequestStatus: "Succeeded" });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});
