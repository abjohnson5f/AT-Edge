import { ScoutReport, ATResponse } from "../types";
import { apiGet, mockApiCall } from "./client";
import { mockScoutReport } from "./mock-data";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function getScoutReport(): Promise<ATResponse<ScoutReport>> {
  if (USE_MOCK) return mockApiCall("/v1/marketdata/scout", mockScoutReport, 800);
  return apiGet<ATResponse<ScoutReport>>("/marketdata/scout");
}

export async function getPriceCheck(locationAlias: string, date: string, time: string, inventoryTypeId: number) {
  if (USE_MOCK) {
    return mockApiCall("/v1/marketdata/price_check", {
      comparables: {
        averageCents: 12500, medianCents: 11000, count: 14, factor: 1.2, exactMatch: true,
        trades: [
          { id: "T-1", priceCents: 11000, date: "2026-03-01T19:00:00Z" },
          { id: "T-2", priceCents: 14000, date: "2026-03-02T19:30:00Z" },
          { id: "T-3", priceCents: 12500, date: "2026-03-05T20:00:00Z" },
        ],
      },
      metrics: { conversionRate: 8.5, bidToAskRatio: 2.4, avgDaysOnMarket: 3.2, popularityScore: 94 },
      forecast: { demandLevel: "High", yoyChangePercent: 12.5, recommendedPriceCents: 13500, profitTargetCents: 3500 },
    }, 600);
  }
  const dateTime = `${date} ${time}:00`;
  return apiGet(`/marketdata/price-check?locationAlias=${encodeURIComponent(locationAlias)}&dateTime=${encodeURIComponent(dateTime)}&inventoryTypeID=${inventoryTypeId}`);
}
