import { useQuery } from "@tanstack/react-query";
import { getScoutReport } from "../api/marketdata";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { RefreshCw, ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import { useState } from "react";
import { LocationRanking } from "../types";

export function Scout() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["scout"], queryFn: getScoutReport });
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    await refetch();
    setIsScanning(false);
  };

  const renderTable = (dataList: LocationRanking[], columns: { key: string, label: string, render: (item: LocationRanking) => React.ReactNode }[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">Rank</TableHead>
          {columns.map(col => <TableHead key={col.key}>{col.label}</TableHead>)}
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dataList.map((item, index) => (
          <TableRow key={item.locationAlias} className="cursor-pointer">
            <TableCell className="font-medium">{index + 1}</TableCell>
            {columns.map(col => <TableCell key={col.key}>{col.render(item)}</TableCell>)}
            <TableCell><ChevronRight className="h-4 w-4 text-zinc-500" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Market Scout</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            Last scan: {data?.Payload?.generatedAt ? new Date(data.Payload.generatedAt).toLocaleTimeString() : "Never"}
          </span>
          <Button onClick={handleScan} disabled={isScanning || isLoading} variant="success">
            <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? "animate-spin" : ""}`} />
            Run Scan
          </Button>
        </div>
      </div>

      <Tabs defaultValue="converting" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-zinc-900">
          <TabsTrigger value="converting">Highest Converting</TabsTrigger>
          <TabsTrigger value="imbalance">Bid/Ask Imbalance</TabsTrigger>
          <TabsTrigger value="underserved">Underserved</TabsTrigger>
          <TabsTrigger value="viewed">Most Viewed</TabsTrigger>
          <TabsTrigger value="toplist">Top List</TabsTrigger>
        </TabsList>
        
        <Card className="mt-4 border-zinc-800 bg-zinc-950">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-zinc-500">Loading market data...</div>
            ) : (
              <>
                <TabsContent value="converting" className="m-0">
                  {renderTable(data?.Payload?.rawData.highestConverting || [], [
                    { key: "loc", label: "Location", render: (item) => <span className="font-semibold">{item.locationName}</span> },
                    { key: "city", label: "City", render: (item) => <span className="text-zinc-400">{item.city}</span> },
                    { key: "conv", label: "Conversion Rate", render: (item) => <Badge variant="success">{item.conversionRate}%</Badge> },
                    { key: "list", label: "Listings (30d)", render: (item) => item.listingCount },
                  ])}
                </TabsContent>
                <TabsContent value="imbalance" className="m-0">
                  {renderTable(data?.Payload?.rawData.mostBidsLeastAsks || [], [
                    { key: "loc", label: "Location", render: (item) => <span className="font-semibold">{item.locationName}</span> },
                    { key: "city", label: "City", render: (item) => <span className="text-zinc-400">{item.city}</span> },
                    { key: "bids", label: "Bids", render: (item) => item.bidCount },
                    { key: "list", label: "Listings", render: (item) => item.listingCount },
                    { key: "ratio", label: "Ratio", render: (item) => <Badge variant="warning">{((item.bidCount || 0) / (item.listingCount || 1)).toFixed(1)}:1</Badge> },
                  ])}
                </TabsContent>
                <TabsContent value="underserved" className="m-0">
                  {renderTable(data?.Payload?.rawData.underserved || [], [
                    { key: "loc", label: "Location", render: (item) => <span className="font-semibold">{item.locationName}</span> },
                    { key: "city", label: "City", render: (item) => <span className="text-zinc-400">{item.city}</span> },
                    { key: "gap", label: "Gap (Bids - Asks)", render: (item) => <span className="text-amber-500 font-bold">+{(item.bidCount || 0) - (item.listingCount || 0)}</span> },
                  ])}
                </TabsContent>
                <TabsContent value="viewed" className="m-0">
                  {renderTable(data?.Payload?.rawData.mostViewedLeastListings || [], [
                    { key: "loc", label: "Location", render: (item) => <span className="font-semibold">{item.locationName}</span> },
                    { key: "city", label: "City", render: (item) => <span className="text-zinc-400">{item.city}</span> },
                    { key: "views", label: "Views", render: (item) => item.viewCount?.toLocaleString() },
                  ])}
                </TabsContent>
                <TabsContent value="toplist" className="m-0">
                  {renderTable(data?.Payload?.rawData.toplist || [], [
                    { key: "loc", label: "Location", render: (item) => <span className="font-semibold">{item.locationName}</span> },
                    { key: "city", label: "City", render: (item) => <span className="text-zinc-400">{item.city}</span> },
                    { key: "score", label: "Score", render: (item) => <Badge variant="default">{item.score}</Badge> },
                  ])}
                </TabsContent>
              </>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {data?.Payload?.report && (
        <Card className="border-zinc-800 bg-zinc-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-amber-500">✨</span> AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none prose-h2:text-lg prose-h3:text-md prose-a:text-blue-400">
              <Markdown>{data.Payload.report}</Markdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
