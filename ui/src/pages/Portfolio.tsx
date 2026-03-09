import { useQuery } from "@tanstack/react-query";
import { getListings } from "../api/listing";
import { getPortfolioReview } from "../api/portfolio";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { formatCurrency, formatDate, formatTime } from "../lib/utils";
import { MoreHorizontal, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";

export function Portfolio() {
  const { data: listingsData, isLoading } = useQuery({ queryKey: ["listings"], queryFn: getListings });
  const { data: reviewData } = useQuery({ queryKey: ["portfolioReview"], queryFn: getPortfolioReview });
  const [showReview, setShowReview] = useState(false);

  const listings = listingsData?.Payload || [];
  const totalValue = listings.reduce((sum, l) => sum + (l.priceAmountInSmallestUnit || 0), 0);
  
  // Calculate days until
  const getDaysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <Button onClick={() => setShowReview(!showReview)} variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
          <Sparkles className="mr-2 h-4 w-4" />
          AI Review
        </Button>
      </div>

      {showReview && reviewData?.Payload?.report && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-amber-500">Portfolio Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none prose-sm prose-h2:text-base prose-h2:text-zinc-100 prose-strong:text-amber-400">
              <Markdown>{reviewData.Payload.report}</Markdown>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Active Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{listings.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Expiring &lt; 48h</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {listings.filter(l => getDaysUntil(l.dateTime) <= 2).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Days</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-500">Loading portfolio...</TableCell></TableRow>
              ) : listings.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-500">No active listings.</TableCell></TableRow>
              ) : (
                listings.map((listing) => {
                  const days = getDaysUntil(listing.dateTime);
                  return (
                    <TableRow key={listing.listingID} className="group">
                      <TableCell className="font-medium">
                        {listing.locationName}
                        {!listing.marketVisibility && <Badge variant="secondary" className="ml-2 text-[10px]">Hidden</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{formatDate(listing.dateTime)}</span>
                          <span className="text-xs text-zinc-500">{formatTime(listing.dateTime)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-400">{listing.inventoryTypeName}</TableCell>
                      <TableCell className="font-mono font-medium">{formatCurrency(listing.priceAmountInSmallestUnit)}</TableCell>
                      <TableCell>
                        <Badge variant={listing.popularityScoreBracket && listing.popularityScoreBracket >= 8 ? "success" : "secondary"}>
                          {listing.popularityScoreBracket}/10
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={days <= 2 ? "text-amber-500 font-bold flex items-center gap-1" : "text-zinc-400"}>
                          {days <= 2 && <AlertTriangle className="h-3 w-3" />}
                          {days}d
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuItem><TrendingUp className="mr-2 h-4 w-4" /> Reprice</DropdownMenuItem>
                            <DropdownMenuItem>Toggle Visibility</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-500">Archive</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
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
