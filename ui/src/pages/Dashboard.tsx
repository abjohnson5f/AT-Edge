import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "../api/account";
import { getListings } from "../api/listing";
import { getBids } from "../api/bid";
import { getScoutReport } from "../api/marketdata";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatCurrency } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import { Minus, Activity, DollarSign, Mail } from "lucide-react";

export function Dashboard() {
  const { data: accountsData } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const { data: listingsData } = useQuery({ queryKey: ["listings"], queryFn: getListings });
  const { data: bidsData } = useQuery({ queryKey: ["bids"], queryFn: getBids });
  const { data: scoutData } = useQuery({ queryKey: ["scout"], queryFn: getScoutReport });

  const balance = accountsData?.Payload?.[0]?.balance || 0;
  const activeListingsCount = listingsData?.Payload?.length || 0;
  const openBidsCount = bidsData?.Payload?.length || 0;
  const pendingImports = 0; // No import tracking yet

  const listings = listingsData?.Payload || [];
  const totalListingValue = listings.reduce((sum, l) => sum + (l.priceAmountInSmallestUnit || 0), 0);

  const topOpportunities = scoutData?.Payload?.rawData.toplist.slice(0, 10) || [];

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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Active Listings</CardTitle>
            <BriefcaseIcon className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeListingsCount}</div>
            <p className="text-xs text-zinc-500">Total value: {totalListingValue > 0 ? formatCurrency(totalListingValue) : "\u2014"}</p>
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
                    <th className="px-4 py-3 rounded-tl-md">Restaurant</th>
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
                        {(opp.conversionRate && opp.conversionRate > 0) ? <Badge variant="success">High Converting</Badge> :
                         (opp.bidCount && opp.listingCount && opp.bidCount > opp.listingCount) ? <Badge variant="warning">Bid Imbalance</Badge> :
                         <Badge variant="secondary">Opportunity</Badge>}
                      </td>
                      <td className="px-4 py-3">{opp.score ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <Minus className="h-4 w-4 text-zinc-500" />
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
            <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
              No recent activity
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
          <div className="h-[300px] w-full flex items-center justify-center text-zinc-500 text-sm">
            No performance data yet
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
