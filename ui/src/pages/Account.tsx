import { useQuery } from "@tanstack/react-query";
import { getAccounts, getTransactions, getUserDetails } from "../api/account";
import { formatCurrency, formatDate } from "../lib/utils";
import { User, Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";

interface Transaction {
  transactionID?: number;
  date?: string;
  transactionDate?: string;
  type?: string;
  transactionType?: string;
  description?: string;
  amount?: number;
  amountInSmallestUnit?: number;
  balance?: number;
  balanceAfter?: number;
  [key: string]: unknown;
}

interface AccountEntry {
  accountID: string;
  accountName: string;
  accountDescription?: string;
  accountAvailableCurrencyBalance: number;
  accountAvailablePointsBalance: number;
  accountNameAndBalance?: string;
  [key: string]: unknown;
}

function extractList<T>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as Record<string, any>;
  const kvl = p?.ResponseBody?.KeyValueList;
  if (Array.isArray(kvl)) return kvl;
  return [];
}

export function Account() {
  const { data: userDetails, isLoading: userLoading } = useQuery({
    queryKey: ["userDetails"],
    queryFn: getUserDetails,
  });

  const { data, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const accounts = extractList<AccountEntry>(data?.Payload);

  const { data: txData, isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => getTransactions(25, 0) as Promise<{ Payload?: unknown }>,
    retry: false,
  });
  const transactions: Transaction[] = extractList<Transaction>(txData?.Payload);

  const rawPayload = userDetails?.Payload as Record<string, any> | undefined;

  const skipFields = new Set([
    "userTaxEarningsData", "userTaxEarningsDataLastUpdateDate",
    "userCommunityVerificationUsers", "userCommunityVerifiedDataPrivacySetting",
    "ATResponseObjectType", "ResponseBody",
  ]);

  const userFields: Record<string, string> = {};
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    for (const [k, v] of Object.entries(rawPayload)) {
      if (!skipFields.has(k) && v != null && v !== "" && v !== "null" && typeof v !== "object") {
        userFields[k] = String(v);
      }
    }
  }

  const labelMap: Record<string, string> = {
    userId: "User ID",
    userAlias: "Alias",
    userEmail: "Email",
    userFirstName: "First Name",
    userLastName: "Last Name",
    userProfession: "Profession",
    userNumberLogins: "Total Logins",
    userAccountStatus: "Account Status",
    userAccountPayoutDetailsStatus: "Payout Status",
    userAccountPayoutDetailsStatusLastUpdateDate: "Payout Updated",
    userCommunityVerificationStatus: "Community Verified",
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Account</h1>
      </div>

      {/* User Details */}
      <div className="acct-section">
        <div className="acct-section-header">
          <User size={14} />
          <span>User Details</span>
        </div>
        <div className="acct-section-body">
          {userLoading ? (
            <div className="scout-loading"><RefreshCw size={14} className="spinning" /> Loading user details...</div>
          ) : Object.keys(userFields).length === 0 ? (
            <div className="acct-empty">No user details available</div>
          ) : (
            <div className="acct-user-grid">
              {Object.entries(userFields).map(([key, value]) => (
                <div key={key} className="acct-user-field">
                  <span className="acct-user-label">{labelMap[key] || key}</span>
                  <span className="acct-user-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accounts */}
      {isLoading ? (
        <div className="scout-loading"><RefreshCw size={14} className="spinning" /> Loading accounts...</div>
      ) : (
        <div className="acct-cards">
          {accounts.map((acc) => {
            const balance = Number(acc.accountAvailableCurrencyBalance) || 0;
            const isMain = acc.accountName === "Main Account";
            return (
              <div key={acc.accountID} className={`acct-card ${isMain ? "acct-card-primary" : ""}`}>
                <div className="acct-card-top">
                  <div>
                    <div className="acct-card-name">{acc.accountName}</div>
                    <div className="acct-card-id">ID: {acc.accountID}</div>
                  </div>
                  {isMain && <span className="acct-badge-primary">Primary</span>}
                </div>
                <div className="acct-card-balance">
                  <span className="acct-card-balance-label">Available Balance</span>
                  <span className="acct-card-balance-value">{formatCurrency(balance)}</span>
                </div>
                {acc.accountDescription && (
                  <div className="acct-card-desc">{acc.accountDescription}</div>
                )}
                <div className="acct-card-footer">
                  <div className="acct-card-stat">
                    <span className="acct-card-stat-label">Points Balance</span>
                    <span className="acct-card-stat-value">{Number(acc.accountAvailablePointsBalance) || 0}</span>
                  </div>
                  <div className="acct-card-stat">
                    <span className="acct-card-stat-label">Currency</span>
                    <span className="acct-card-stat-value">USD</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction History */}
      <div className="acct-section">
        <div className="acct-section-header">
          <Wallet size={14} />
          <span>Recent Transactions</span>
        </div>
        <div className="scout-table-container">
          <table className="scout-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th className="scout-th-right">Amount</th>
                <th className="scout-th-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {txLoading && !txError ? (
                <tr>
                  <td colSpan={5} className="acct-table-empty">Loading transactions...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="acct-table-empty">No transaction history available</td>
                </tr>
              ) : (
                transactions.map((tx, i) => {
                  const txDate = tx.date || tx.transactionDate || "";
                  const txType = tx.type || tx.transactionType || "Unknown";
                  const txAmount = tx.amount ?? tx.amountInSmallestUnit ?? 0;
                  const txBalance = tx.balance ?? tx.balanceAfter;
                  const isPositive = txAmount > 0;
                  return (
                    <tr key={tx.transactionID ?? i} className="scout-row">
                      <td><span className="scout-metric-dim">{formatDate(txDate) || "\u2014"}</span></td>
                      <td>
                        <span className={`acct-tx-type ${isPositive ? "credit" : txType === "Fee" ? "fee" : "debit"}`}>
                          {isPositive ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                          {txType}
                        </span>
                      </td>
                      <td>{tx.description || "\u2014"}</td>
                      <td className="scout-td-right">
                        <span className={`scout-metric-value ${isPositive ? "positive-text" : ""}`}>
                          {isPositive ? "+" : ""}{formatCurrency(txAmount)}
                        </span>
                      </td>
                      <td className="scout-td-right">
                        <span className="scout-metric-dim">
                          {txBalance != null ? formatCurrency(txBalance) : "\u2014"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
