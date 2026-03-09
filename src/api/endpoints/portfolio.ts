import { ATClient } from "../client.js";
import type { Listing, PortfolioListingsParams } from "../types.js";

export class PortfolioAPI {
  constructor(private client: ATClient) {}

  /** Get all listings in your portfolio */
  async getListings(params: PortfolioListingsParams = {}) {
    return this.client.request<Listing[]>("portfolio/get_listings", {
      getPopularityScoreBracket: params.getPopularityScoreBracket ?? true,
      dateTimeRangeStart: params.dateTimeRangeStart,
      dateTimeRangeEnd: params.dateTimeRangeEnd,
    });
  }

  /** Get all order lists */
  async getOrderLists() {
    return this.client.request("portfolio/get_order_lists");
  }

  /** Get items in an order list */
  async getOrderListItems(orderListID: string) {
    return this.client.request("portfolio/get_order_list_items", {
      orderListID,
    });
  }

  /** Create a new order list */
  async setOrderList(name: string, execute = false) {
    return this.client.write("portfolio/set_order_list", { name }, execute);
  }

  /** Search valid location identifiers for buy orders */
  async getValidLocationIdentifiers(
    searchFilter: string,
    pageSize = 10
  ) {
    return this.client.request("portfolio/get_valid_location_identifiers", {
      searchFilter,
      pageSize,
    });
  }
}
