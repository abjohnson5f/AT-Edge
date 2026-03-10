import { PortfolioReview, ATResponse } from "../types";
import { apiGet } from "./client";

export async function getPortfolioReview(): Promise<ATResponse<PortfolioReview>> {
  return apiGet<ATResponse<PortfolioReview>>("/portfolio/review");
}
