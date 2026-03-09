import { ATClient, getClient } from "./client.js";
import { MarketDataAPI } from "./endpoints/marketdata.js";
import { LocationAPI } from "./endpoints/location.js";
import { ListingAPI } from "./endpoints/listing.js";
import { PortfolioAPI } from "./endpoints/portfolio.js";
import { BidAPI } from "./endpoints/bid.js";
import { AccountAPI } from "./endpoints/account.js";

export class ATAPI {
  public marketdata: MarketDataAPI;
  public location: LocationAPI;
  public listing: ListingAPI;
  public portfolio: PortfolioAPI;
  public bid: BidAPI;
  public account: AccountAPI;

  constructor(client?: ATClient) {
    const c = client ?? getClient();
    this.marketdata = new MarketDataAPI(c);
    this.location = new LocationAPI(c);
    this.listing = new ListingAPI(c);
    this.portfolio = new PortfolioAPI(c);
    this.bid = new BidAPI(c);
    this.account = new AccountAPI(c);
  }
}

export { ATClient, getClient } from "./client.js";
export * from "./types.js";
