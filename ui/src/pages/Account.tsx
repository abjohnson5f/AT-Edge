import { useQuery } from "@tanstack/react-query";
import { getAccounts, getTransactions } from "../api/account";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { formatCurrency } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

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

export function Account() {
  const { data, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const accounts = data?.Payload || [];

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => getTransactions(25, 0) as Promise<{ Payload?: Transaction[] }>,
  });
  const transactions: Transaction[] = txData?.Payload || [];

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Account Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="text-zinc-500">Loading accounts...</div>
        ) : (
          accounts.map((acc, i) => (
            <Card key={acc.accountID} className={`bg-zinc-950 border-zinc-800 ${i === 0 ? 'border-green-500/30 shadow-[0_0_10px_rgba(16,185,129,0.05)]' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle>{acc.accountName}</CardTitle>
                  {i === 0 && <Badge variant="success">Primary</Badge>}
                </div>
                <CardDescription>ID: {acc.accountID}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-sm text-zinc-400">Available Balance</div>
                    <div className="text-3xl font-bold text-white">{formatCurrency(acc.balance)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
                    <div>
                      <div className="text-xs text-zinc-500">Credit Limit</div>
                      <div className="text-sm font-medium">{formatCurrency(acc.creditLimit)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Currency</div>
                      <div className="text-sm font-medium">{acc.currency}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="bg-zinc-950 border-zinc-800 mt-4">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-8">Loading transactions...</TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-8">No transaction history available</TableCell>
                </TableRow>
              ) : (
                transactions.map((tx, i) => {
                  const txDate = tx.date || tx.transactionDate || "";
                  const txType = tx.type || tx.transactionType || "Unknown";
                  const txAmount = tx.amount ?? tx.amountInSmallestUnit ?? 0;
                  const txBalance = tx.balance ?? tx.balanceAfter;
                  return (
                    <TableRow key={tx.transactionID ?? i}>
                      <TableCell className="text-zinc-400">{txDate ? new Date(txDate).toLocaleDateString() : "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant={txAmount > 0 ? "success" : txType === "Fee" ? "secondary" : "outline"}>
                          {txType}
                        </Badge>
                      </TableCell>
                      <TableCell>{tx.description || "\u2014"}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${txAmount > 0 ? 'text-green-500' : 'text-zinc-300'}`}>
                        {txAmount > 0 ? '+' : ''}{formatCurrency(txAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-400">{txBalance != null ? formatCurrency(txBalance) : "\u2014"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
