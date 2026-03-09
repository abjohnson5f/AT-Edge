import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "../api/account";
import { getListings } from "../api/listing";
import { getBids } from "../api/bid";
import { getScoutReport } from "../api/marketdata";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatCurrency } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, Activity, PlusCircle, DollarSign, Mail } from "lucide-react";

export function Dashboard() {
  const { data: accountsData } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const { data: listingsData } = useQuery({ queryKey: ["listings"], queryFn: getListings });
  const { data: bidsData } = useQuery({ queryKey: ["bids"], queryFn: getBids });
  const { data: scoutData } = useQuery({ queryKey: ["scout"], queryFn: getScoutReport });

  const balance = accountsData?.Payload?.[0]?.balance || 0;
  const activeListingsCount = listingsData?.Payload?.length || 0;
  const openBidsCount = bidsData?.Payload?.length || 0;
  const pendingImports = 3; // Mocked

  const topOpportunities = scoutData?.Payload?.rawData.toplist.slice(0, 10) || [];

  // Mock portfolio performance data
  const performanceData = Array.from({ length: 30 }).map((_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: 10000 + Math.random() * 5000 + (i * 100),
  }));

  const recentActivity = [
    { id: 1, type: "listing", icon: PlusCircle, text: "Created listing for Carbone (Table for 2)", time: "10m ago" },
    { id: 2, type: "price", icon: DollarSign, text: "Repriced Nobu Malibu to $85.00", time: "1h ago" },
    { id: 3, type: "bid", icon: Activity, text: "Filled bid for The French Laundry at $450.00", time: "3h ago" },
    { id: 4, type: "email", icon: Mail, text: "Imported 2 reservations from Gmail", time: "5h ago" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Top Row: Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Account Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(balance)}</div>
            <p className="text-xs text-zinc-500">+2.1% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Active Listings</CardTitle>
            <BriefcaseIcon className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeListingsCount}</div>
            <p className="text-xs text-zinc-500">Total value: {formatCurrency(150000)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Open Bids</CardTitle>
            <Activity className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openBidsCount}</div>
            <p className="text-xs text-zinc-500">Matching your inventory</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Pending Imports</CardTitle>
            <Mail className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingImports}</div>
            <p className="text-xs text-zinc-500">Unprocessed emails</p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Market Pulse */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Market Pulse (Top Opportunities)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-md">Location</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Signal</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3 rounded-tr-md">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities.map((opp, i) => (
                    <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                      <td className="px-4 py-3 font-medium">{opp.locationName}</td>
                      <td className="px-4 py-3 text-zinc-400">{opp.city}</td>
                      <td className="px-4 py-3">
                        {i === 0 ? <Badge variant="warning">Underserved</Badge> : 
                         i === 1 ? <Badge variant="success">High Converting</Badge> : 
                         <Badge variant="secondary">Bid Imbalance</Badge>}
                      </td>
                      <td className="px-4 py-3">{opp.score}</td>
                      <td className="px-4 py-3">
                        {i % 3 === 0 ? <ArrowUpRight className="h-4 w-4 text-green-500" /> : 
                         i % 3 === 1 ? <Minus className="h-4 w-4 text-zinc-500" /> : 
                         <ArrowDownRight className="h-4 w-4 text-red-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4">
                  <div className="mt-0.5 rounded-full bg-zinc-800 p-1.5">
                    <activity.icon className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium leading-none">{activity.text}</p>
                    <p className="text-xs text-zinc-500">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="date" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                  itemStyle={{ color: '#10b981' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
                />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BriefcaseIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  )
}
