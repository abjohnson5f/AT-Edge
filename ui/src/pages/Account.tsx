import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "../api/account";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { formatCurrency } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

export function Account() {
  const { data, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const accounts = data?.Payload || [];

  const mockTransactions = [
    { id: 1, date: "2026-03-08T14:30:00Z", type: "Sale", desc: "Sold Carbone (Table for 2)", amount: 15000, balance: 1245000 },
    { id: 2, date: "2026-03-07T09:15:00Z", type: "Purchase", desc: "Bought Nobu Malibu", amount: -8500, balance: 1230000 },
    { id: 3, date: "2026-03-05T18:45:00Z", type: "Fee", desc: "Platform Fee", amount: -1500, balance: 1238500 },
    { id: 4, date: "2026-03-01T10:00:00Z", type: "Deposit", desc: "Wire Transfer", amount: 500000, balance: 1240000 },
  ];

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
              {mockTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-zinc-400">{new Date(tx.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={tx.amount > 0 ? "success" : tx.type === "Fee" ? "secondary" : "outline"}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{tx.desc}</TableCell>
                  <TableCell className={`text-right font-mono font-medium ${tx.amount > 0 ? 'text-green-500' : 'text-zinc-300'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-zinc-400">{formatCurrency(tx.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
