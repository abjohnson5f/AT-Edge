import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPriceCheck } from "../api/marketdata";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { formatCurrency, formatDate } from "../lib/utils";
import { Search, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

export function PriceCheck() {
  const [location, setLocation] = useState("carbone-new-york");
  const [date, setDate] = useState("2026-03-15");
  const [time, setTime] = useState("19:00");
  const [inventoryType, setInventoryType] = useState("1");
  const [hasSearched, setHasSearched] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["priceCheck", location, date, time, inventoryType],
    queryFn: () => getPriceCheck(location, date, time, parseInt(inventoryType)),
    enabled: false,
  });

  const handleCheck = () => {
    setHasSearched(true);
    refetch();
  };

  const result = (data as any)?.Payload ?? data;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Price Check</h1>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="md:col-span-2 space-y-2">
              <Label>Location Alias</Label>
              <Input 
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
                placeholder="e.g. carbone-new-york"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input 
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)}
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <Button onClick={handleCheck} disabled={isLoading} className="w-full" variant="success">
              <Search className="mr-2 h-4 w-4" /> Check
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="text-center py-12 text-zinc-500">Analyzing market data...</div>}

      {hasSearched && result && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Comps */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Comparable Trades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm text-zinc-400 mb-1">Average Clearing Price</div>
                <div className="text-4xl font-bold text-white">{formatCurrency(result.comparables.averageCents)}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-zinc-900">
                  <div className="text-xs text-zinc-500">Median</div>
                  <div className="text-lg font-semibold">{formatCurrency(result.comparables.medianCents)}</div>
                </div>
                <div className="p-3 rounded-lg bg-zinc-900">
                  <div className="text-xs text-zinc-500">Sample Size</div>
                  <div className="text-lg font-semibold">{result.comparables.count} trades</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Recent Trades</div>
                {result.comparables.trades.map((t: any) => (
                  <div key={t.id} className="flex justify-between items-center p-2 rounded bg-zinc-900/50 text-sm">
                    <span className="text-zinc-400">{formatDate(t.date)}</span>
                    <span className="font-mono">{formatCurrency(t.priceCents)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Column 2: Metrics */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Market Metrics (90d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 flex flex-col justify-center">
                  <div className="text-sm text-zinc-400 mb-1">Conversion Rate</div>
                  <div className="text-2xl font-bold text-green-500">{result.metrics.conversionRate}%</div>
                </div>
                <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 flex flex-col justify-center">
                  <div className="text-sm text-zinc-400 mb-1">Bid/Ask Ratio</div>
                  <div className="text-2xl font-bold text-amber-500">{result.metrics.bidToAskRatio}</div>
                </div>
                <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 flex flex-col justify-center">
                  <div className="text-sm text-zinc-400 mb-1">Avg Days on Market</div>
                  <div className="text-2xl font-bold">{result.metrics.avgDaysOnMarket}</div>
                </div>
                <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 flex flex-col justify-center">
                  <div className="text-sm text-zinc-400 mb-1">Popularity Score</div>
                  <div className="text-2xl font-bold text-white">{result.metrics.popularityScore}/100</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Column 3: Forecast */}
          <Card className="bg-zinc-950 border-green-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <CardHeader>
              <CardTitle className="text-lg text-green-500 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Edge Forecast
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm text-zinc-400 mb-1">Recommended List Price</div>
                <div className="text-4xl font-bold text-white">{formatCurrency(result.forecast.recommendedPriceCents)}</div>
                <div className="text-sm text-green-500 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Target Profit: {formatCurrency(result.forecast.profitTargetCents)}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Predicted Demand</span>
                  <span className="text-sm font-semibold text-amber-500">{result.forecast.demandLevel}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">YoY Price Change</span>
                  <span className="text-sm font-semibold text-green-500">+{result.forecast.yoyChangePercent}%</span>
                </div>
              </div>

              <Button className="w-full" variant="success">Create Listing at {formatCurrency(result.forecast.recommendedPriceCents)}</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
