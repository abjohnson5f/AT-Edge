import { ATClient } from "../client.js";
import type { CompetingListing, SetPriceParams } from "../types.js";

export class ListingAPI {
  constructor(private client: ATClient) {}

  /** Get competing listings for one of your listings */
  async getCompetingListings(listingID: string) {
    return this.client.request<CompetingListing[]>(
      "listing/get_competing_listings",
      { listingID }
    );
  }

  /** Change listing price */
  async setPrice(params: SetPriceParams, execute = false) {
    return this.client.write<boolean>("listing/set_price", {
      listingID: params.listingID,
      priceAmountInSmallestUnit: params.priceAmountInSmallestUnit,
    }, execute);
  }

  /** Change market visibility (on/off market) */
  async setMarketVisibility(
    listingID: string,
    visible: boolean,
    execute = false
  ) {
    return this.client.write<boolean>("listing/set_market_visibility", {
      listingID,
      isVisible: visible,
    }, execute);
  }

  /** Fill an open bid with your listing */
  async fillBid(listingID: string, bidID: number, execute = false) {
    return this.client.write<boolean>("listing/set_fill_bid", {
      listingID,
      bidID,
    }, execute);
  }

  /** Archive a listing */
  async archive(listingID: string, execute = false) {
    return this.client.write<boolean>("listing/set_archive", {
      listingID,
    }, execute);
  }

  /** Purchase a listing */
  async purchase(listingID: string, execute = false) {
    return this.client.write("listing/set_purchase", {
      listingID,
    }, execute);
  }

  /** Create listing from template */
  async createFromTemplate(templateID: string, execute = false) {
    return this.client.write<string>("listing/set_create_from_template", {
      templateID,
    }, execute);
  }
}
