import { Account, ATResponse } from "../types";
import { apiGet, mockApiCall } from "./client";
import { mockAccounts } from "./mock-data";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function getAccounts(): Promise<ATResponse<Account[]>> {
  if (USE_MOCK) return mockApiCall("/v1/account/get_list", mockAccounts);
  return apiGet<ATResponse<Account[]>>("/account/list");
}

export async function getTransactions(pageSize = 50, pageNumber = 0) {
  return apiGet(`/account/transactions?pageSize=${pageSize}&pageNumber=${pageNumber}`);
}
