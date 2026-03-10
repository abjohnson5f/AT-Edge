import { ScoutReport, ATResponse } from "../types";
import { apiGet } from "./client";

export async function getScoutReport(): Promise<ATResponse<ScoutReport>> {
  return apiGet<ATResponse<ScoutReport>>("/marketdata/scout");
}

export async function getPriceCheck(locationAlias: string, date: string, time: string, inventoryTypeId: number) {
  const dateTime = `${date} ${time}:00`;
  return apiGet(`/marketdata/price-check?locationAlias=${encodeURIComponent(locationAlias)}&dateTime=${encodeURIComponent(dateTime)}&inventoryTypeID=${inventoryTypeId}`);
}
