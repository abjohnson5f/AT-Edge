import { Router } from "express";
import { createHash } from "crypto";
import { runAgent } from "../agent.js";
import { hasDatabase, recordImport, upsertLocation } from "../db/index.js";

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

// POST /api/import/parse — Parse an email and get pricing
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

    // Try to parse the JSON response from the agent
    let importData;
    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      importData = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, return the raw text
      importData = { rawAnalysis: result.text };
    }

    // Persist to memory (Tier 2 + Tier 3)
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

        // Upsert location entity if matched
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
