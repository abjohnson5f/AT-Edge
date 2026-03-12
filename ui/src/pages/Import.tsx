import { useState, useRef } from "react";
import { Mail, Upload, CheckCircle2, CircleDashed, DollarSign, AlertTriangle, X } from "lucide-react";
import Markdown from "react-markdown";
import { formatCurrency, formatDate } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";
import { apiPost } from "../api/client";

const INVENTORY_TYPE_LABELS: Record<number, string> = {
  1: "Reservation Transfer",
  2: "Reservation",
};

export function Import() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"gmail" | "manual">("manual");
  const [isProcessing, setIsProcessing] = useState(false);
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
    setStepText(["Sending to Claude Agent for parsing..."]);

    try {
      setStepText(prev => [...prev, "Agent parsing email + searching AT locations..."]);

      const result = await apiPost<any>("/import/parse", {
        subject: "Forwarded Reservation",
        body: emailBody,
      });

      setStepText(prev => [...prev, "Comparable trades retrieved"]);

      if (result.RequestStatus === "Failed") {
        throw new Error(result.ResponseMessage);
      }

      const payload = result.Payload;
      setStepText(prev => [...prev, "Pricing recommendation generated"]);

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
        rawAnalysis: payload.rawAnalysis ?? null,
        parsed: payload.parsed ?? null,
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
        setStepText([]);
        if (textareaRef.current) textareaRef.current.value = "";
      }
    } catch (err) {
      toast({ title: "Listing creation failed", description: String(err), variant: "destructive" });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Import Reservations</h1>
      </div>

      {/* Tabs */}
      <div className="scout-tabs">
        <button
          type="button"
          className={`scout-tab ${activeTab === "gmail" ? "active" : ""}`}
          onClick={() => setActiveTab("gmail")}
        >
          <Mail size={13} />
          Gmail Sync
        </button>
        <button
          type="button"
          className={`scout-tab ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          <Upload size={13} />
          Manual Paste
        </button>
      </div>

      {/* Gmail Tab */}
      {activeTab === "gmail" && (
        <div className="import-panel">
          <div className="import-empty">
            <Mail size={40} className="import-empty-icon" />
            <p className="import-empty-title">Gmail integration requires OAuth setup</p>
            <p className="import-empty-desc">
              Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env
            </p>
            <button type="button" className="modal-btn secondary" style={{ marginTop: "var(--space-4)" }}>
              Connect Gmail
            </button>
          </div>
        </div>
      )}

      {/* Manual Paste Tab */}
      {activeTab === "manual" && (
        <div className="import-grid">
          {/* Left: Paste area */}
          <div className="import-panel">
            <div className="import-panel-header">
              <span className="import-panel-title">Paste Confirmation Email</span>
              <span className="import-panel-desc">Forward your reservation confirmation and paste the content here</span>
            </div>
            <div className="import-panel-body">
              <textarea
                ref={textareaRef}
                className="import-textarea"
                placeholder={"Paste the full text of your reservation confirmation email here...\n\nExample:\nYour reservation at Carbone is confirmed!\nDate: Saturday, March 15, 2026\nTime: 7:00 PM\nParty Size: 2\nName: Alex Johnson\nConfirmation #: RES-99821"}
              />
            </div>
            <div className="import-panel-footer">
              <button
                type="button"
                className="import-parse-btn"
                onClick={handleManualParse}
                disabled={isProcessing}
              >
                {isProcessing ? "Agent processing..." : "Parse & Import"}
              </button>
            </div>
          </div>

          {/* Right: Results */}
          <div className="import-results">
            {/* Processing Pipeline */}
            {(isProcessing || stepText.length > 0) && (
              <div className="import-panel">
                <div className="import-panel-header">
                  <span className="import-panel-title">Processing Pipeline</span>
                </div>
                <div className="import-pipeline">
                  {stepText.map((text, i) => (
                    <div key={i} className="import-step completed">
                      <CheckCircle2 size={16} />
                      <span>{text}</span>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="import-step pending">
                      <CircleDashed size={16} className="spinning" />
                      <span>Waiting for agent...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="import-error">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Agent raw response (unstructured) */}
            {parsedData && !isProcessing && parsedData.rawAnalysis && !parsedData.parsed && (
              <div className="import-panel">
                <div className="import-panel-header">
                  <div className="import-agent-header">
                    <AlertTriangle size={16} className="import-amber" />
                    <span className="import-panel-title import-amber">Agent Response</span>
                    <span className="import-badge warning">Unstructured</span>
                  </div>
                </div>
                <div className="import-panel-body">
                  <div className="scout-ai-content"><Markdown>{parsedData.rawAnalysis}</Markdown></div>
                </div>
              </div>
            )}

            {/* Parsed result */}
            {parsedData && !isProcessing && !(parsedData.rawAnalysis && !parsedData.parsed) && (
              <>
                {/* Restaurant match card */}
                <div className="import-panel import-match-panel">
                  <div className="import-match-header">
                    <div>
                      <div className="import-match-name">{parsedData.restaurantName}</div>
                      <div className="import-match-meta">
                        {formatDate(parsedData.date)} @ {parsedData.time} &middot; Party of {parsedData.partySize}
                        <span className="import-match-type">
                          {INVENTORY_TYPE_LABELS[parsedData.inventoryTypeID] ?? `Type #${parsedData.inventoryTypeID}`}
                        </span>
                      </div>
                    </div>
                    <span className={`import-badge ${parsedData.locationMatch ? "success" : "warning"}`}>
                      {parsedData.locationMatch ? "Match Found" : "No AT Match"}
                    </span>
                  </div>

                  <div className="import-fields">
                    <div className="import-field">
                      <label>First Name</label>
                      <input
                        type="text"
                        defaultValue={parsedData.firstName}
                        onChange={e => parsedData.firstName = e.target.value}
                        className="import-input"
                      />
                    </div>
                    <div className="import-field">
                      <label>Last Name</label>
                      <input
                        type="text"
                        defaultValue={parsedData.lastName}
                        onChange={e => parsedData.lastName = e.target.value}
                        className="import-input"
                      />
                    </div>
                    <div className="import-field">
                      <label>Conf Number</label>
                      <input
                        type="text"
                        defaultValue={parsedData.confirmationNumber}
                        className="import-input mono"
                      />
                    </div>
                    <div className="import-field">
                      <label>Phone</label>
                      <input
                        type="text"
                        defaultValue={parsedData.phone}
                        onChange={e => parsedData.phone = e.target.value}
                        className="import-input"
                      />
                    </div>
                  </div>

                  {parsedData.locationMatch && (
                    <div className="import-alias">
                      AT Location: <span>{parsedData.locationMatch.alias}</span>
                    </div>
                  )}

                  {parsedData.toolCalls?.length > 0 && (
                    <details className="import-tool-calls">
                      <summary>Agent used {parsedData.toolCalls.length} tool(s)</summary>
                      <ul>
                        {parsedData.toolCalls.map((tc: any, i: number) => (
                          <li key={i}>{tc.name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                {/* Pricing strategy card */}
                <div className="import-panel import-pricing-panel">
                  <div className="import-panel-header">
                    <div className="import-pricing-title">
                      <DollarSign size={16} className="import-green" />
                      <span className="import-panel-title">Pricing Strategy</span>
                    </div>
                  </div>
                  <div className="import-panel-body">
                    <div className="import-pricing-hero">
                      <span className="import-pricing-amount">{formatCurrency(parsedData.recommendedPriceCents)}</span>
                      <span className="import-pricing-label">Recommended Ask</span>
                    </div>
                    {parsedData.priceRangeMinCents > 0 && (
                      <div className="import-pricing-range">
                        Range: {formatCurrency(parsedData.priceRangeMinCents)} &mdash; {formatCurrency(parsedData.priceRangeMaxCents)}
                      </div>
                    )}
                    <div className="import-pricing-advice">
                      <span className="import-pricing-advice-label">AI Reasoning:</span>
                      {parsedData.pricingAdvice}
                    </div>
                    <div className="import-pricing-actions">
                      <button
                        type="button"
                        className="modal-btn secondary"
                        onClick={() => handleCreateListing(true)}
                        disabled={!parsedData.locationMatch}
                      >
                        Dry Run
                      </button>
                      <button
                        type="button"
                        className="modal-btn primary"
                        onClick={() => handleCreateListing(false)}
                        disabled={!parsedData.locationMatch}
                      >
                        Create Live Listing
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
