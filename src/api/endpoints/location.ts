import { ATClient } from "../client.js";
import type {
  ComparableTradesParams,
  MetricHistoryParams,
  InventoryType,
  CreateListingParams,
  PaginationParams,
} from "../types.js";

export class LocationAPI {
  constructor(private client: ATClient) {}

  /** Search locations by alias */
  async getList(searchFilter: string, params: PaginationParams = {}) {
    return this.client.request("location/get_list", {
      searchFilter,
      ...params,
    });
  }

  /** Location category and required fields for listings */
  async getCategory(locationAlias: string) {
    return this.client.request("location/get_category", { locationAlias });
  }

  /** Available inventory types for a location */
  async getInventoryTypes(locationAlias: string) {
    return this.client.request<InventoryType[]>(
      "location/get_inventory_types",
      { locationAlias }
    );
  }

  /** 90-day trading metrics for a location */
  async getMetrics(
    locationAlias: string,
    dateRangeStart: string,
    dateRangeEnd: string
  ) {
    return this.client.request("location/get_metrics", {
      locationAlias,
      dateRangeStart,
      dateRangeEnd,
    });
  }

  /** Historical metrics over time with configurable interval */
  async getMetricHistory(params: MetricHistoryParams) {
    return this.client.request(
      "location/get_metric_history",
      params as unknown as Record<string, unknown>
    );
  }

  /** Comparable trade prices for a specific slot */
  async getComparableTrades(params: ComparableTradesParams) {
    return this.client.request(
      "location/get_comparable_trades",
      params as unknown as Record<string, unknown>
    );
  }

  /** Related locations (useful for forecast data enrichment) */
  async getRelatedLocations(locationAlias: string) {
    return this.client.request("location/get_related_location_list", {
      locationAlias,
    });
  }

  /** Create a new listing at a location */
  async setListing(params: CreateListingParams, execute = false) {
    return this.client.write<string>("location/set_listing", {
      ...(params as unknown as Record<string, unknown>),
      locationCategoryFieldIDValueList:
        params.locationCategoryFieldIDValueList,
    }, execute);
  }

  /** Search cities */
  async getCityList(searchFilter: string, params: PaginationParams = {}) {
    return this.client.request("location/get_city_list", {
      searchFilter,
      ...params,
    });
  }

  /** Search categories */
  async getCategoryList(searchFilter: string, params: PaginationParams = {}) {
    return this.client.request("location/get_category_list", {
      searchFilter,
      ...params,
    });
  }
}
