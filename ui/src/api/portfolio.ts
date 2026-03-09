import { PortfolioReview, ATResponse } from "../types";
import { apiGet, mockApiCall } from "./client";
import { mockPortfolioReview } from "./mock-data";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function getPortfolioReview(): Promise<ATResponse<PortfolioReview>> {
  if (USE_MOCK) return mockApiCall("/v1/portfolio/review", mockPortfolioReview, 1000);
  return apiGet<ATResponse<PortfolioReview>>("/portfolio/review");
}
