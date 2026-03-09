import { Bid, ATResponse } from "../types";
import { apiGet, mockApiCall } from "./client";
import { mockBids } from "./mock-data";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function getBids(): Promise<ATResponse<Bid[]>> {
  if (USE_MOCK) return mockApiCall("/v1/bid/get_list", mockBids);
  return apiGet<ATResponse<Bid[]>>("/bid/list");
}
