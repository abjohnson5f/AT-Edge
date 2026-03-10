import { Account, ATResponse } from "../types";
import { apiGet } from "./client";

export async function getAccounts(): Promise<ATResponse<Account[]>> {
  return apiGet<ATResponse<Account[]>>("/account/list");
}

export async function getTransactions(pageSize = 50, pageNumber = 0) {
  return apiGet(`/account/transactions?pageSize=${pageSize}&pageNumber=${pageNumber}`);
}
