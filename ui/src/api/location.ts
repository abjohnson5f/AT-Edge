import { ATResponse } from "../types";
import { apiGet } from "./client";

export async function searchLocations(query: string): Promise<ATResponse<{ alias: string; name: string }[]>> {
  return apiGet<ATResponse<{ alias: string; name: string }[]>>(`/location/search?q=${encodeURIComponent(query)}`);
}

export async function getInventoryTypes(locationAlias: string): Promise<ATResponse<{ id: number; name: string }[]>> {
  return apiGet<ATResponse<{ id: number; name: string }[]>>(`/location/${locationAlias}/inventory-types`);
}

/** Fetch all known locations from the memory system (Neon DB) */
export async function getLocations(): Promise<{ locations: Array<{ alias: string; name?: string }>; count: number }> {
  return apiGet<{ locations: Array<{ alias: string; name?: string }>; count: number }>("/memory/locations");
}
