import { ATClient } from "../client.js";
import type { PaginationParams, LocationRanking, InventoryForecastParams } from "../types.js";

export class MarketDataAPI {
  constructor(private client: ATClient) {}

  /** Best converting venues — most demand for listings */
  async getHighestConvertingLocations(params: PaginationParams = {}) {
    return this.client.request<LocationRanking[]>(
      "marketdata/get_highest_converting_locations",
      params
    );
  }

  /** Highest bid-to-listing ratio — supply/demand imbalance */
  async getMostBidsLeastAsks(params: PaginationParams = {}) {
    return this.client.request<LocationRanking[]>(
      "marketdata/get_most_bids_least_asks",
      params
    );
  }

  /** Most bids + fewest listings in past 30 days */
  async getMostUnderservedLocations(params: PaginationParams = {}) {
    return this.client.request<LocationRanking[]>(
      "marketdata/get_most_underserved_locations",
      params
    );
  }

  /** High views + few listings — attention without supply */
  async getMostViewedLeastListings(params: PaginationParams = {}) {
    return this.client.request<LocationRanking[]>(
      "marketdata/get_most_viewed_locations_with_least_listings",
      params
    );
  }

  /** Predicted inventory needs based on historical data (PAID: $0.10/call) */
  async getRequiredInventoryForecast(params: InventoryForecastParams) {
    return this.client.request(
      "marketdata/get_required_inventory_forecast",
      params as unknown as Record<string, unknown>
    );
  }

  /** Top locations by bids vs listings in past 30 days */
  async getToplist(params: PaginationParams = {}) {
    return this.client.request<LocationRanking[]>(
      "marketdata/get_toplist",
      params
    );
  }
}
