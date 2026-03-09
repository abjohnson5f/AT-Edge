import { ATClient } from "../client.js";
import type { Bid, PlaceBidParams, PaginationParams } from "../types.js";

export class BidAPI {
  constructor(private client: ATClient) {}

  /** Get all available bids (5-minute reporting delay) */
  async getList(
    params: {
      creatorUserAlias?: string;
      locationAlias?: string;
    } & PaginationParams = {}
  ) {
    return this.client.request<Bid[]>("bid/get_list", params);
  }

  /** Place a new bid */
  async set(params: PlaceBidParams, execute = false) {
    return this.client.write(
      "bid/set",
      params as unknown as Record<string, unknown>,
      execute
    );
  }

  /** Cancel an active bid */
  async cancel(bidID: number, execute = false) {
    return this.client.write("bid/set_cancel", { bidID }, execute);
  }
}
