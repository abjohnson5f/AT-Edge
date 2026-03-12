import { Account, ATResponse } from "../types";
import { apiGet } from "./client";

export async function getAccounts(): Promise<ATResponse<Account[]>> {
  return apiGet<ATResponse<Account[]>>("/account/list");
}

export async function getTransactions(pageSize = 25, pageNumber = 0) {
  return apiGet(`/account/transactions?pageSize=${pageSize}&pageNumber=${pageNumber}`);
}

export async function getUserDetails(): Promise<ATResponse<unknown>> {
  return apiGet<ATResponse<unknown>>("/account/details");
}
