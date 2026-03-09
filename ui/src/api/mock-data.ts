import { Account, Bid, Listing, LocationRanking, ScoutReport, PortfolioReview } from "../types";

export const mockAccounts: Account[] = [
  {
    accountID: 1,
    accountName: "Main Trading",
    accountNameAndBalance: "Main Trading ($12,450.00)",
    balance: 1245000,
    creditLimit: 5000000,
    currency: "USD",
  },
  {
    accountID: 2,
    accountName: "Reserve",
    accountNameAndBalance: "Reserve ($3,200.00)",
    balance: 320000,
    creditLimit: 0,
    currency: "USD",
  },
];

export const mockListings: Listing[] = [
  {
    listingID: "L-1001",
    locationAlias: "carbone-new-york",
    locationName: "Carbone",
    dateTime: new Date(Date.now() + 86400000 * 2).toISOString(), // +2 days
    priceAmountInSmallestUnit: 15000,
    inventoryTypeID: 1,
    inventoryTypeName: "Table for 2",
    status: "Active",
    popularityScoreBracket: 9,
    marketVisibility: true,
  },
  {
    listingID: "L-1002",
    locationAlias: "the-french-laundry-yountville",
    locationName: "The French Laundry",
    dateTime: new Date(Date.now() + 86400000 * 14).toISOString(), // +14 days
    priceAmountInSmallestUnit: 45000,
    inventoryTypeID: 2,
    inventoryTypeName: "Table for 4",
    status: "Active",
    popularityScoreBracket: 10,
    marketVisibility: true,
  },
  {
    listingID: "L-1003",
    locationAlias: "nobu-malibu",
    locationName: "Nobu Malibu",
    dateTime: new Date(Date.now() + 86400000 * 5).toISOString(),
    priceAmountInSmallestUnit: 8500,
    inventoryTypeID: 1,
    inventoryTypeName: "Table for 2",
    status: "Active",
    popularityScoreBracket: 8,
    marketVisibility: true,
  },
  {
    listingID: "L-1004",
    locationAlias: "eleven-madison-park-new-york",
    locationName: "Eleven Madison Park",
    dateTime: new Date(Date.now() + 86400000 * 1).toISOString(),
    priceAmountInSmallestUnit: 12000,
    inventoryTypeID: 1,
    inventoryTypeName: "Table for 2",
    status: "Active",
    popularityScoreBracket: 7,
    marketVisibility: true,
  },
];

export const mockBids: Bid[] = [
  {
    bidID: 5001,
    locationAlias: "carbone-new-york",
    locationName: "Carbone",
    bidAmount: 12000,
    dateTimeRangeStart: new Date(Date.now() + 86400000 * 1).toISOString(),
    dateTimeRangeEnd: new Date(Date.now() + 86400000 * 3).toISOString(),
    inventoryTypeID: 1,
    creatorUserAlias: "buyer_123",
  },
  {
    bidID: 5002,
    locationAlias: "don-angie-new-york",
    locationName: "Don Angie",
    bidAmount: 6500,
    dateTimeRangeStart: new Date(Date.now() + 86400000 * 5).toISOString(),
    dateTimeRangeEnd: new Date(Date.now() + 86400000 * 7).toISOString(),
    inventoryTypeID: 2,
    creatorUserAlias: "foodie_ny",
  },
];

export const mockLocationRankings: LocationRanking[] = [
  {
    locationAlias: "carbone-new-york",
    locationName: "Carbone",
    city: "New York",
    score: 98,
    bidCount: 145,
    listingCount: 12,
    viewCount: 15400,
    conversionRate: 8.5,
  },
  {
    locationAlias: "the-french-laundry-yountville",
    locationName: "The French Laundry",
    city: "Yountville",
    score: 95,
    bidCount: 89,
    listingCount: 4,
    viewCount: 12000,
    conversionRate: 12.1,
  },
  {
    locationAlias: "nobu-malibu",
    locationName: "Nobu Malibu",
    city: "Malibu",
    score: 92,
    bidCount: 112,
    listingCount: 18,
    viewCount: 9800,
    conversionRate: 6.2,
  },
  {
    locationAlias: "don-angie-new-york",
    locationName: "Don Angie",
    city: "New York",
    score: 88,
    bidCount: 76,
    listingCount: 5,
    viewCount: 8500,
    conversionRate: 9.4,
  },
  {
    locationAlias: "polo-bar-new-york",
    locationName: "The Polo Bar",
    city: "New York",
    score: 85,
    bidCount: 95,
    listingCount: 8,
    viewCount: 11200,
    conversionRate: 7.8,
  },
];

export const mockScoutReport: ScoutReport = {
  report: `# Market Intelligence Report

## Executive Summary
The New York market continues to show strong demand for Italian concepts, with **Carbone** and **Don Angie** exhibiting the highest bid-to-ask ratios. West Coast demand is heavily concentrated on **Nobu Malibu** weekend sunsets.

### Key Opportunities
*   **Underserved:** Don Angie (New York) has 76 active bids but only 5 listings. Consider acquiring inventory here.
*   **High Converting:** The French Laundry maintains a 12.1% conversion rate, suggesting buyers are highly motivated and less price-sensitive.
*   **Bid Imbalance:** Polo Bar has a 12:1 bid-to-listing ratio for Friday/Saturday nights.

### Pricing Recommendations
*   Increase asks on Carbone 2-tops for dates within 72 hours; current market clearing price is trending up to $160.
*   Hold Nobu Malibu inventory until 48 hours before the reservation time to maximize premium.
`,
  rawData: {
    highestConverting: [...mockLocationRankings].sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0)),
    mostBidsLeastAsks: [...mockLocationRankings].sort((a, b) => ((b.bidCount || 0) / (b.listingCount || 1)) - ((a.bidCount || 0) / (a.listingCount || 1))),
    underserved: [...mockLocationRankings].sort((a, b) => ((b.bidCount || 0) - (b.listingCount || 0)) - ((a.bidCount || 0) - (a.listingCount || 0))),
    mostViewedLeastListings: [...mockLocationRankings].sort((a, b) => ((b.viewCount || 0) / (b.listingCount || 1)) - ((a.viewCount || 0) / (a.listingCount || 1))),
    toplist: [...mockLocationRankings].sort((a, b) => (b.score || 0) - (a.score || 0)),
  },
  generatedAt: new Date().toISOString(),
};

export const mockPortfolioReview: PortfolioReview = {
  report: `# Portfolio Analysis

## Reprice Recommendations
*   **L-1001 (Carbone):** Current price $150.00. Recommended: **$165.00**. Demand is surging for this weekend.
*   **L-1004 (Eleven Madison Park):** Current price $120.00. Recommended: **$95.00**. Expiring in 24h, 3 competing listings recently lowered prices.

## Bid Alerts
*   There is an open bid of **$120.00** for Carbone that matches your L-1001 listing parameters. Consider filling if you want immediate liquidity.

## Expiring Soon
*   **L-1004 (Eleven Madison Park)** expires tomorrow. Action required to avoid spoilage.
`,
  listings: mockListings,
  generatedAt: new Date().toISOString(),
};
