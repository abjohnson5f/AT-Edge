import { ATResponse } from "../types";
import { apiGet, mockApiCall } from "./client";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function searchLocations(query: string): Promise<ATResponse<{ alias: string; name: string }[]>> {
  if (USE_MOCK) {
    const results = [
      { alias: "carbone-new-york", name: "Carbone (New York)" },
      { alias: "the-french-laundry-yountville", name: "The French Laundry (Yountville)" },
      { alias: "nobu-malibu", name: "Nobu Malibu (Malibu)" },
      { alias: "eleven-madison-park-new-york", name: "Eleven Madison Park (New York)" },
      { alias: "don-angie-new-york", name: "Don Angie (New York)" },
      { alias: "polo-bar-new-york", name: "The Polo Bar (New York)" },
    ].filter(loc => loc.name.toLowerCase().includes(query.toLowerCase()));
    return mockApiCall("/v1/location/search", results);
  }
  return apiGet<ATResponse<{ alias: string; name: string }[]>>(`/location/search?q=${encodeURIComponent(query)}`);
}

export async function getInventoryTypes(locationAlias: string): Promise<ATResponse<{ id: number; name: string }[]>> {
  if (USE_MOCK) {
    return mockApiCall(`/v1/location/${locationAlias}/inventory_types`, [
      { id: 1, name: "Table for 2" },
      { id: 2, name: "Table for 4" },
      { id: 3, name: "Table for 6" },
      { id: 4, name: "Bar Seating (2)" },
    ]);
  }
  return apiGet<ATResponse<{ id: number; name: string }[]>>(`/location/${locationAlias}/inventory-types`);
}
