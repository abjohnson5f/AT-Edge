import Anthropic from "@anthropic-ai/sdk";
import { ATAPI } from "../api/index.js";
import { config } from "../config.js";

const SCOUT_SYSTEM = `You are AT Edge Scout, an intelligent market analyst for AppointmentTrader.

Your job is to analyze market data from AppointmentTrader's API and produce actionable intelligence reports for a seller.

You identify:
1. SUPPLY-DEMAND IMBALANCES: Where buyers want inventory that sellers aren't providing
2. HIGH-CONVERSION VENUES: Where listings sell fast (low time-on-market)
3. TRENDING UP: Locations gaining momentum (views, bids increasing)
4. PRICING OPPORTUNITIES: Where comparable trades suggest room for premium pricing

For each opportunity, provide:
- Location name and alias
- Why it's an opportunity (specific data points)
- Estimated price range based on comparable data
- Risk level (low/medium/high) and reasoning
- Recommended action (list, bid, monitor)

Be quantitative. Use the actual numbers from the data. No fluff.
Format your report in clean markdown sections.`;

export async function runScout(options: { pageSize?: number } = {}) {
  const api = new ATAPI();
  const pageSize = options.pageSize ?? 50;

  console.log("  Scanning market data...\n");

  // Pull all market signals in parallel
  const [
    highestConverting,
    mostBidsLeastAsks,
    underserved,
    mostViewedLeastListings,
    toplist,
  ] = await Promise.all([
    api.marketdata.getHighestConvertingLocations({ pageSize }),
    api.marketdata.getMostBidsLeastAsks({ pageSize }),
    api.marketdata.getMostUnderservedLocations({ pageSize }),
    api.marketdata.getMostViewedLeastListings({ pageSize }),
    api.marketdata.getToplist({ pageSize }),
  ]);

  console.log("  Market data collected. Analyzing with Claude...\n");

  // Prepare data digest for Claude
  const marketDigest = {
    highestConverting: highestConverting.Payload,
    mostBidsLeastAsks: mostBidsLeastAsks.Payload,
    underserved: underserved.Payload,
    mostViewedLeastListings: mostViewedLeastListings.Payload,
    toplist: toplist.Payload,
    timestamp: new Date().toISOString(),
  };

  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: SCOUT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Analyze the following AppointmentTrader market data and produce an intelligence report.

Identify the top opportunities where I should consider acquiring or listing inventory.
Cross-reference across all data sources — a location that appears in multiple lists is a stronger signal.

Market Data (${new Date().toLocaleDateString("en-US")}):

${JSON.stringify(marketDigest, null, 2)}`,
      },
    ],
  });

  const report =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    report,
    rawData: marketDigest,
    generatedAt: new Date().toISOString(),
  };
}
