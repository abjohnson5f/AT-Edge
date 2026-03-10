import { Bid, ATResponse } from "../types";
import { apiGet } from "./client";

export async function getBids(): Promise<ATResponse<Bid[]>> {
  return apiGet<ATResponse<Bid[]>>("/bid/list");
}
