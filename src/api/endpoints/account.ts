import { ATClient } from "../client.js";
import type { Account } from "../types.js";

export class AccountAPI {
  constructor(private client: ATClient) {}

  /** Get all accounts with balances and credit limits */
  async getList() {
    return this.client.request<Account[]>("account/get_list");
  }

  /** Get user details */
  async getUserDetails() {
    return this.client.request("user/get_details");
  }

  /** Get transaction history */
  async getTransactionHistory(pageSize = 50, pageNumber = 0) {
    return this.client.request("user/get_transaction_history", {
      pageSize,
      pageNumber,
    });
  }
}
