import { Listing, ATResponse } from "../types";
import { apiGet, apiPost, mockApiCall } from "./client";
import { mockListings } from "./mock-data";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function getListings(): Promise<ATResponse<Listing[]>> {
  if (USE_MOCK) return mockApiCall("/v1/listing/get_list", mockListings);
  return apiGet<ATResponse<Listing[]>>("/portfolio/listings");
}

export async function updateListingPrice(listingID: string, priceAmountInSmallestUnit: number, execute = false) {
  if (USE_MOCK) return mockApiCall(`/v1/listing/set_price`, { success: true });
  return apiPost(`/listing/${listingID}/price`, { priceAmountInSmallestUnit, execute });
}

export async function toggleVisibility(listingID: string, visible: boolean, execute = false) {
  return apiPost(`/listing/${listingID}/visibility`, { visible, execute });
}

export async function archiveListing(listingID: string, execute = false) {
  return apiPost(`/listing/${listingID}/archive`, { execute });
}
