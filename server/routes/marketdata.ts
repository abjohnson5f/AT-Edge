import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";
import { runAgent } from "../agent.js";
import { hasDatabase, storeSnapshot } from "../db/index.js";

export const marketdataRoutes = Router();

const SCOUT_SYSTEM = `You are AT Edge Scout, an intelligent market analyst for AppointmentTrader.

You have tools to pull real-time market data from AppointmentTrader. Use them to build a comprehensive market intelligence report.

Your job:
1. Call the market data tools to gather signals (highest converting, bid/ask imbalance, underserved, most viewed, toplist)
2. Cross-reference locations that appear in multiple lists — these are the strongest signals
3. Produce an actionable report with:
   - Top opportunities ranked by conviction
   - Specific data points backing each recommendation
   - Price ranges and risk levels
   - Clear recommended actions (list, bid, or monitor)

Be quantitative. Use actual numbers. Format in clean markdown.`;

// GET /api/marketdata/scout — Full agent-powered market scan
marketdataRoutes.get("/scout", async (_req, res) => {
  try {
    const result = await runAgent(
      SCOUT_SYSTEM,
      `Run a full market scan. Pull data from all 5 market data sources (highest converting, bid/ask imbalance, underserved, most viewed, toplist) with pageSize=25. Then analyze and produce an intelligence report with the top opportunities.

Today's date: ${new Date().toLocaleDateString("en-US")}

IMPORTANT: After your analysis, use the memory_learn tool to store any significant market patterns you discover (e.g., "Carbone has consistently high bid-to-ask ratio indicating strong demand"). Only store durable insights, not raw data.`,
      { sessionType: "scout" },
    );

    // Persist scout report as market snapshot
    if (hasDatabase()) {
      try {
        await storeSnapshot("scout_report", {
          report: result.text,
          toolCalls: result.toolCalls,
        }, result.sessionId);
      } catch { /* optional */ }
    }

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        report: result.text,
        toolCalls: result.toolCalls,
        sessionId: result.sessionId,
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

// GET /api/marketdata/price-check — Agent-powered price analysis
marketdataRoutes.get("/price-check", async (req, res) => {
  const { locationAlias, dateTime, inventoryTypeID } = req.query;

  if (!locationAlias || !dateTime) {
    return res.status(400).json({
      RequestStatus: "Failed",
      ResponseMessage: "locationAlias and dateTime are required",
    });
  }

  try {
    const result = await runAgent(
      `You are a pricing analyst for AppointmentTrader. Use the available tools to gather comprehensive pricing data for the requested location and time, then provide a clear pricing recommendation.

Gather: comparable trades, location metrics (90-day), inventory types, and inventory forecast if applicable. Synthesize into a recommendation.

IMPORTANT: First use memory_recall to check what you already know about this location. After analysis, use memory_learn to store any new pricing insights.`,
      `Analyze pricing for:
- Location: ${locationAlias}
- Date/Time: ${dateTime}
- Inventory Type: ${inventoryTypeID ?? "2"}

Pull comparable trades, 90-day metrics, and forecast data. Then recommend an optimal listing price with reasoning.`,
      { sessionType: "price_check", locationAlias: locationAlias as string },
    );

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        analysis: result.text,
        toolCalls: result.toolCalls,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
