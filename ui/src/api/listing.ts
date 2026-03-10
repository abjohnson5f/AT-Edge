import { Listing, ATResponse } from "../types";
import { apiGet, apiPost } from "./client";

export async function getListings(): Promise<ATResponse<Listing[]>> {
  return apiGet<ATResponse<Listing[]>>("/portfolio/listings");
}

export async function updateListingPrice(listingID: string, priceAmountInSmallestUnit: number, execute = false) {
  return apiPost(`/listing/${listingID}/price`, { priceAmountInSmallestUnit, execute });
}

export async function toggleVisibility(listingID: string, visible: boolean, execute = false) {
  return apiPost(`/listing/${listingID}/visibility`, { visible, execute });
}

export async function archiveListing(listingID: string, execute = false) {
  return apiPost(`/listing/${listingID}/archive`, { execute });
}
