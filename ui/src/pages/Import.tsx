import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Mail, Upload, CheckCircle2, CircleDashed, DollarSign, AlertTriangle } from "lucide-react";
import { formatCurrency } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";
import { apiPost } from "../api/client";

export function Import() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(0);
  const [stepText, setStepText] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleManualParse = async () => {
    const emailBody = textareaRef.current?.value;
    if (!emailBody?.trim()) {
      toast({ title: "No email content", description: "Paste a reservation confirmation email first.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setError(null);
    setParsedData(null);
    setStep(1);
    setStepText(["Sending to Claude Agent for parsing..."]);

    try {
      setStep(2);
      setStepText(prev => [...prev, "Agent parsing email + searching AT locations..."]);

      const result = await apiPost<any>("/import/parse", {
        subject: "Forwarded Reservation",
        body: emailBody,
      });

      setStep(3);
      setStepText(prev => [...prev, "Comparable trades retrieved"]);

      if (result.RequestStatus === "Failed") {
        throw new Error(result.ResponseMessage);
      }

      const payload = result.Payload;

      setStep(4);
      setStepText(prev => [...prev, "Pricing recommendation generated"]);

      // Map agent response to UI format
      setParsedData({
        restaurantName: payload.parsed?.restaurantName ?? "Unknown",
        locationAlias: payload.locationMatch?.alias ?? null,
        date: payload.parsed?.date ?? "",
        time: payload.parsed?.time ?? "",
        partySize: payload.parsed?.partySize ?? 2,
        firstName: payload.parsed?.firstName ?? "",
        lastName: payload.parsed?.lastName ?? "",
        email: payload.parsed?.email ?? "",
        phone: payload.parsed?.phone ?? "",
        confirmationNumber: payload.parsed?.confirmationNumber ?? "",
        recommendedPriceCents: payload.pricing?.recommendedPriceCents ?? 0,
        priceRangeMinCents: payload.pricing?.priceRangeMinCents ?? 0,
        priceRangeMaxCents: payload.pricing?.priceRangeMaxCents ?? 0,
        pricingAdvice: payload.pricing?.reasoning ?? payload.rawAnalysis ?? "No pricing data available.",
        locationMatch: payload.locationMatch,
        inventoryTypeID: payload.inventoryTypeID ?? 2,
        toolCalls: payload.toolCalls ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateListing = async (isDryRun: boolean) => {
    if (!parsedData?.locationMatch?.alias) {
      toast({ title: "No location match", description: "Cannot create listing without a matched AT location.", variant: "destructive" });
      return;
    }

    try {
      const result = await apiPost<any>(`/location/${parsedData.locationMatch.alias}/listing`, {
        inventoryTypeID: parsedData.inventoryTypeID,
        priceAmountInSmallestUnit: parsedData.recommendedPriceCents,
        currencyCode: "USD",
        dateTime: `${parsedData.date} ${parsedData.time}:00`,
        firstName: parsedData.firstName,
        lastName: parsedData.lastName,
        emailAddress: parsedData.email,
        phoneNumber: parsedData.phone,
        locationCategoryFieldIDValueList: [],
        execute: !isDryRun,
      });

      toast({
        title: isDryRun ? "Dry Run Successful" : "Listing Created!",
        description: `${parsedData.restaurantName} on ${parsedData.date} at ${formatCurrency(parsedData.recommendedPriceCents)}${result.executedLive ? "" : " (dry run)"}`,
      });

      if (!isDryRun) {
        setParsedData(null);
        setStep(0);
        setStepText([]);
        if (textareaRef.current) textareaRef.current.value = "";
      }
    } catch (err) {
      toast({ title: "Listing creation failed", description: String(err), variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import Reservations</h1>
      </div>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-zinc-900">
          <TabsTrigger value="gmail"><Mail className="mr-2 h-4 w-4" /> Gmail Sync</TabsTrigger>
          <TabsTrigger value="manual"><Upload className="mr-2 h-4 w-4" /> Manual Paste</TabsTrigger>
        </TabsList>

        <TabsContent value="gmail" className="mt-6">
          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Pending Emails</CardTitle>
              <CardDescription>Scanning label AT-Import</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <Mail className="h-12 w-12 mb-4 opacity-20" />
                <p>Gmail integration requires OAuth setup.</p>
                <p className="text-xs mt-2">Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env</p>
                <Button variant="outline" className="mt-4">Connect Gmail</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-zinc-800 bg-zinc-950">
              <CardHeader>
                <CardTitle>Paste Confirmation Email</CardTitle>
                <CardDescription>Forward your reservation confirmation and paste the content here</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={textareaRef}
                  placeholder="Paste the full text of your reservation confirmation email here...

Example:
Your reservation at Carbone is confirmed!
Date: Saturday, March 15, 2026
Time: 7:00 PM
Party Size: 2
Name: Alex Johnson
Confirmation #: RES-99821"
                  className="min-h-[300px] font-mono text-xs bg-zinc-900 border-zinc-800"
                />
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleManualParse}
                  disabled={isProcessing}
                  className="w-full"
                  variant="success"
                >
                  {isProcessing ? "Agent processing..." : "Parse & Import"}
                </Button>
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-6">
              {(isProcessing || stepText.length > 0) && (
                <Card className="border-zinc-800 bg-zinc-950">
                  <CardHeader>
                    <CardTitle className="text-sm">Processing Pipeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {stepText.map((text, i) => (
                      <StepItem key={i} active={true} text={text} />
                    ))}
                    {isProcessing && <StepItem active={false} text="Waiting for agent..." />}
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardContent className="flex items-center gap-3 p-4">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </CardContent>
                </Card>
              )}

              {parsedData && !isProcessing && (
                <>
                  <Card className="border-zinc-800 bg-zinc-950 border-green-500/20">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl text-green-400">{parsedData.restaurantName}</CardTitle>
                          <CardDescription>{parsedData.date} @ {parsedData.time} • Party of {parsedData.partySize}</CardDescription>
                        </div>
                        {parsedData.locationMatch ? (
                          <Badge variant="success">Match Found</Badge>
                        ) : (
                          <Badge variant="warning">No AT Match</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <Label className="text-zinc-500">First Name</Label>
                          <Input defaultValue={parsedData.firstName} className="h-8 mt-1 bg-zinc-900 border-zinc-800" onChange={e => parsedData.firstName = e.target.value} />
                        </div>
                        <div>
                          <Label className="text-zinc-500">Last Name</Label>
                          <Input defaultValue={parsedData.lastName} className="h-8 mt-1 bg-zinc-900 border-zinc-800" onChange={e => parsedData.lastName = e.target.value} />
                        </div>
                        <div>
                          <Label className="text-zinc-500">Conf Number</Label>
                          <Input defaultValue={parsedData.confirmationNumber} className="h-8 mt-1 bg-zinc-900 border-zinc-800 font-mono" />
                        </div>
                        <div>
                          <Label className="text-zinc-500">Phone</Label>
                          <Input defaultValue={parsedData.phone} className="h-8 mt-1 bg-zinc-900 border-zinc-800" onChange={e => parsedData.phone = e.target.value} />
                        </div>
                      </div>
                      {parsedData.locationMatch && (
                        <div className="text-xs text-zinc-500 mt-2">
                          AT Location: <span className="font-mono text-zinc-400">{parsedData.locationMatch.alias}</span>
                        </div>
                      )}
                      {parsedData.toolCalls?.length > 0 && (
                        <details className="text-xs text-zinc-500 mt-2">
                          <summary className="cursor-pointer hover:text-zinc-400">Agent used {parsedData.toolCalls.length} tool(s)</summary>
                          <ul className="mt-1 space-y-1 pl-4">
                            {parsedData.toolCalls.map((tc: any, i: number) => (
                              <li key={i} className="font-mono">{tc.name}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="h-5 w-5 text-green-500" /> Pricing Strategy
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-4 mb-4">
                        <div className="text-4xl font-bold text-white">{formatCurrency(parsedData.recommendedPriceCents)}</div>
                        <div className="text-sm text-zinc-400 mb-1">Recommended Ask</div>
                      </div>
                      {parsedData.priceRangeMinCents > 0 && (
                        <div className="text-sm text-zinc-500 mb-3">
                          Range: {formatCurrency(parsedData.priceRangeMinCents)} — {formatCurrency(parsedData.priceRangeMaxCents)}
                        </div>
                      )}
                      <div className="p-3 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-300 mb-6">
                        <span className="text-amber-500 font-semibold mr-2">AI Reasoning:</span>
                        {parsedData.pricingAdvice}
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={() => handleCreateListing(true)} variant="warning" className="flex-1" disabled={!parsedData.locationMatch}>Dry Run</Button>
                        <Button onClick={() => handleCreateListing(false)} variant="success" className="flex-1" disabled={!parsedData.locationMatch}>Create Live Listing</Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepItem({ active, text }: { active: boolean, text: string }) {
  return (
    <div className={`flex items-center gap-3 ${active ? "text-zinc-100" : "text-zinc-600"}`}>
      {active ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <CircleDashed className="h-5 w-5 animate-pulse" />}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
