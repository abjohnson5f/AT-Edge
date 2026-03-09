import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";
import { runAgent } from "../agent.js";

export const portfolioRoutes = Router();

// GET /api/portfolio/listings
portfolioRoutes.get("/listings", async (_req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.portfolio.getListings({ getPopularityScoreBracket: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/portfolio/review — Agent-powered portfolio analysis
portfolioRoutes.get("/review", async (_req, res) => {
  try {
    const result = await runAgent(
      `You are AT Edge Portfolio Manager, an intelligent pricing and portfolio analyst for AppointmentTrader.

Use your tools to:
1. Get the user's portfolio listings with popularity scores
2. For the top listings, check competing listings
3. Check available bids that might match the user's inventory

Then produce an actionable analysis with:
- REPRICE RECOMMENDATIONS: Listings that should be repriced (with specific listingIDs and dollar amounts)
- BID ALERTS: Open bids that match inventory — instant money on the table
- UNDERPERFORMERS: Low popularity score listings needing attention
- EXPIRING SOON: Listings approaching their date that should be discounted

Be direct. Use dollar amounts. Every recommendation should be actionable.`,
      `Review my portfolio. Get my listings, check competition for each, and scan for matching bids. Then give me specific, actionable recommendations.

Today's date: ${new Date().toLocaleDateString("en-US")}`,
      { sessionType: "portfolio_review" },
    );

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        report: result.text,
        toolCalls: result.toolCalls,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
