import Anthropic from "@anthropic-ai/sdk";
import { ATAPI } from "../api/index.js";
import { config } from "../config.js";

const PORTFOLIO_SYSTEM = `You are AT Edge Portfolio Manager, an intelligent pricing and portfolio analyst for AppointmentTrader.

Given the user's current portfolio of listings along with competitive data and comparable trades, you provide:

1. REPRICE RECOMMENDATIONS: Listings that should be repriced based on competition and comps
2. BID ALERTS: Open bids that match your inventory — instant money on the table
3. UNDERPERFORMERS: Listings with low popularity scores that may need attention
4. EXPIRING SOON: Listings approaching their date that should be discounted for quick sale

For each recommendation, provide the specific listingID and the exact action to take.
Be direct and actionable. Use dollar amounts.`;

export async function runPortfolioReview() {
  const api = new ATAPI();

  console.log("  Loading portfolio...\n");

  // Get portfolio with popularity scores
  const portfolio = await api.portfolio.getListings({
    getPopularityScoreBracket: true,
  });

  const listings = portfolio.Payload;

  if (!listings || (Array.isArray(listings) && listings.length === 0)) {
    console.log("  Portfolio is empty. Import some reservations first.\n");
    return { report: "No listings in portfolio.", listings: [] };
  }

  console.log(
    `  Found ${Array.isArray(listings) ? listings.length : "?"} listing(s). Analyzing...\n`
  );

  // For each listing, get competing listings (limit to first 10 to avoid rate issues)
  const listingsArray = Array.isArray(listings)
    ? listings
    : (listings as any)?.KeyValueList ?? [];

  const competitiveData: Record<string, unknown> = {};

  const toAnalyze = listingsArray.slice(0, 10);
  for (const listing of toAnalyze) {
    const id = listing.listingID ?? listing.id;
    if (id) {
      try {
        const competing = await api.listing.getCompetingListings(id);
        competitiveData[id] = competing.Payload;
      } catch {
        competitiveData[id] = "no competing data available";
      }
    }
  }

  // Get active bids that might match our inventory
  const bids = await api.bid.getList({ pageSize: 100 });

  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: PORTFOLIO_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Review my portfolio and provide actionable recommendations.

My Listings:
${JSON.stringify(listingsArray, null, 2)}

Competitive Data (per listing):
${JSON.stringify(competitiveData, null, 2)}

Active Bids on Platform:
${JSON.stringify(bids.Payload, null, 2)}

Today's date: ${new Date().toLocaleDateString("en-US")}`,
      },
    ],
  });

  const report =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    report,
    listings: listingsArray,
    generatedAt: new Date().toISOString(),
  };
}
