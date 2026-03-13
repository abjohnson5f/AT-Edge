import { useState, useRef, useEffect, useCallback } from "react";
import { Mail, Upload, CheckCircle2, CircleDashed, DollarSign, AlertTriangle, RefreshCw, Inbox, Zap, Clock, Wifi, WifiOff } from "lucide-react";
import { ScreenshotUpload } from "../components/ScreenshotUpload";
import Markdown from "react-markdown";
import { formatCurrency, formatDate } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";
import { apiPost, apiGet } from "../api/client";

const INVENTORY_TYPE_LABELS: Record<number, string> = {
  1: "Reservation Transfer",
  2: "Reservation",
};

// ── Module-level component (not inside Import) so React doesn't remount on every render ──
function ScannerStatusBar({ status }: { status: ScannerStatus | null }) {
  if (!status) return null;
  const { configured, idleConnected, scanInProgress, lastScanTime, consecutiveIdleFailures } = status;

  if (!configured) {
    return (
      <div className="import-scanner-bar unconfigured">
        <WifiOff size={12} />
        <span>Email scanner not configured — set <code>GMAIL_USER</code> + <code>GMAIL_APP_PASSWORD</code></span>
      </div>
    );
  }

  const lastScan = new Date(lastScanTime);
  const minutesAgo = Math.floor((Date.now() - lastScan.getTime()) / 60_000);
  const lastScanLabel = minutesAgo < 1 ? "just now" : minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`;

  return (
    <div className={`import-scanner-bar ${idleConnected ? "connected" : consecutiveIdleFailures > 3 ? "degraded" : "connecting"}`}>
      {idleConnected
        ? <><Zap size={12} /><span>Live IDLE — inbox watched in real-time</span></>
        : consecutiveIdleFailures > 3
        ? <><WifiOff size={12} /><span>IDLE unavailable — polling every 15 min</span></>
        : <><Wifi size={12} /><span>Connecting to Gmail...</span></>
      }
      <span className="import-scanner-divider">·</span>
      {scanInProgress
        ? <><RefreshCw size={11} className="spinning" /><span>Scanning...</span></>
        : <><Clock size={11} /><span>Last scan {lastScanLabel}</span></>
      }
    </div>
  );
}

interface QueueItem {
  id: number;
  email_subject: string;
  parsed_data: any;
  location_alias: string | null;
  location_matched: boolean;
  recommended_price: number | null;
  agent_reasoning: string | null;
  status: "auto_queued" | "parsed";
  created_at: string;
}

interface ScannerStatus {
  configured: boolean;
  running: boolean;
  idleConnected: boolean;
  lastScanTime: string;
  scanInProgress: boolean;
  consecutiveIdleFailures: number;
  totalEmailsProcessed: number;
  totalReservationsFound: number;
  lastError: string | null;
}

export function Import() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("auto");

  // Scanner state
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);

  // Manual paste state
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepText, setStepText] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load scanner status + queue on mount ──
  const loadScannerStatus = useCallback(async () => {
    try {
      const res = await apiGet<any>("/import/scanner-status");
      if (res.RequestStatus === "Succeeded") {
        setScannerStatus(res.Payload);
      }
    } catch { /* scanner may not be running */ }
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await apiGet<any>("/import/queue");
      if (res.RequestStatus === "Succeeded") {
        setQueueItems(res.Payload.items ?? []);
      }
    } catch { /* queue unavailable */ } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScannerStatus();
    loadQueue();

    // Background refresh every 2 min — IMAP IDLE handles real-time detection,
    // this just keeps the status bar and queue count current
    const interval = setInterval(() => {
      loadScannerStatus();
      if (activeTab === "auto") loadQueue();
    }, 2 * 60_000);
    return () => clearInterval(interval);
  }, [loadScannerStatus, loadQueue, activeTab]);

  // ── Scan Now ──
  const handleScanNow = async () => {
    setScanning(true);
    try {
      const res = await apiPost<any>("/import/scan-now", {});
      if (res.RequestStatus === "Succeeded") {
        const { scanned, reservations } = res.Payload;
        toast({
          title: "Scan complete",
          description: reservations > 0
            ? `Found ${reservations} reservation${reservations > 1 ? "s" : ""} in ${scanned} email${scanned > 1 ? "s" : ""}`
            : `Scanned ${scanned} email${scanned > 1 ? "s" : ""} — no new reservations`,
        });
        await loadQueue();
        await loadScannerStatus();
      } else {
        toast({ title: "Scan failed", description: res.ResponseMessage, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Scan failed", description: String(err), variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  // ── Dismiss queue item ──
  const handleDismiss = async (itemId: number) => {
    try {
      await apiPost<any>(`/import/queue/${itemId}/dismiss`, {});
      setQueueItems(prev => prev.filter(i => i.id !== itemId));
      if (selectedItem?.id === itemId) setSelectedItem(null);
    } catch {
      toast({ title: "Dismiss failed", variant: "destructive" });
    }
  };

  // ── Select queue item for listing creation ──
  const handleSelectItem = (item: QueueItem) => {
    setSelectedItem(item);
    const pd = item.parsed_data?.parsed ?? item.parsed_data;
    if (!pd) return;

    // Map queue item into the parsedData shape used by the listing UI
    setParsedData({
      restaurantName: pd.restaurantName ?? "Unknown",
      locationAlias: item.location_alias,
      date: pd.date ?? "",
      time: pd.time ?? "",
      partySize: pd.partySize ?? 2,
      firstName: pd.firstName ?? "",
      lastName: pd.lastName ?? "",
      email: pd.email ?? "",
      phone: pd.phone ?? "",
      confirmationNumber: pd.confirmationNumber ?? "",
      recommendedPriceCents: item.recommended_price ?? 0,
      priceRangeMinCents: item.parsed_data?.pricing?.priceRangeMinCents ?? 0,
      priceRangeMaxCents: item.parsed_data?.pricing?.priceRangeMaxCents ?? 0,
      pricingAdvice: item.agent_reasoning ?? item.parsed_data?.pricing?.reasoning ?? "Auto-imported by AI scanner.",
      locationMatch: item.location_matched ? { alias: item.location_alias, name: pd.restaurantName } : null,
      inventoryTypeID: item.parsed_data?.inventoryTypeID ?? 2,
      toolCalls: [],
      rawAnalysis: null,
      parsed: pd,
      _queueId: item.id,
    });
    // Stay on auto tab — ListingPanel renders on the right side of import-auto-layout
  };

  // ── Manual parse ──
  const handleManualParse = async () => {
    const emailBody = textareaRef.current?.value;
    if (!emailBody?.trim()) {
      toast({ title: "No email content", description: "Paste a reservation confirmation email first.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setError(null);
    setParsedData(null);
    setSelectedItem(null);
    setStepText(["Sending to Claude Agent for parsing..."]);

    try {
      setStepText(prev => [...prev, "Agent parsing email + searching AT locations..."]);

      const result = await apiPost<any>("/import/parse", {
        subject: "Forwarded Reservation",
        body: emailBody,
      });

      setStepText(prev => [...prev, "Comparable trades retrieved"]);

      if (result.RequestStatus === "Failed") throw new Error(result.ResponseMessage);

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

  // ── Create listing ──
  const handleCreateListing = async (isDryRun: boolean) => {
    if (!parsedData?.locationMatch?.alias) {
      toast({ title: "No location match", description: "Cannot create listing without a matched AT location.", variant: "destructive" });
      return;
    }

    // Validate required fields before hitting the AT API
    const missing: string[] = [];
    if (!parsedData.firstName?.trim()) missing.push("First Name");
    if (!parsedData.lastName?.trim()) missing.push("Last Name");
    if (!parsedData.email?.trim()) missing.push("Email");
    if (!parsedData.phone?.trim()) missing.push("Phone");
    if (missing.length > 0) {
      toast({
        title: "Required fields missing",
        description: `Please fill in: ${missing.join(", ")}`,
        variant: "destructive",
      });
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
        confirmationNumber: parsedData.confirmationNumber,
        screenshotUrl: parsedData.screenshotUrl ?? "",
        locationCategoryFieldIDValueList: [],
        execute: !isDryRun,
      });

      toast({
        title: isDryRun ? "Dry Run Successful" : "Listing Created!",
        description: `${parsedData.restaurantName} on ${parsedData.date} at ${formatCurrency(parsedData.recommendedPriceCents)}`,
      });

      if (!isDryRun) {
        // Dismiss the queue item if this came from the auto queue
        if (parsedData._queueId) {
          await handleDismiss(parsedData._queueId);
        }
        setParsedData(null);
        setStepText([]);
        if (textareaRef.current) textareaRef.current.value = "";
        setActiveTab("auto");
        await loadQueue();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Listing creation failed", description: msg, variant: "destructive" });
    }
  };

  // ScannerStatusBar is defined at module level (below) to avoid remounting on every render

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Import Reservations</h1>
      </div>

      {/* Scanner status bar */}
      <ScannerStatusBar status={scannerStatus} />

      {/* Tabs */}
      <div className="scout-tabs">
        <button
          type="button"
          className={`scout-tab ${activeTab === "auto" ? "active" : ""}`}
          onClick={() => setActiveTab("auto")}
        >
          <Inbox size={13} />
          Auto-Imported
          {queueItems.length > 0 && (
            <span className="import-queue-badge">{queueItems.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`scout-tab ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => { setActiveTab("manual"); setSelectedItem(null); }}
        >
          <Upload size={13} />
          Manual Paste
        </button>
      </div>

      {/* ── Auto-Imported Tab ── */}
      {activeTab === "auto" && (
        <div className="import-auto-layout">
          {/* Queue panel */}
          <div className="import-panel">
            <div className="import-panel-header">
              <div>
                <span className="import-panel-title">Reservation Queue</span>
                <span className="import-panel-desc">
                  {scannerStatus?.configured
                    ? "Claude scans your inbox automatically and queues reservation confirmations here."
                    : "Configure GMAIL_USER + GMAIL_APP_PASSWORD to enable auto-scanning."}
                </span>
              </div>
              <button
                type="button"
                className="scout-btn scout-btn-scan"
                onClick={handleScanNow}
                disabled={scanning || !scannerStatus?.configured}
              >
                <RefreshCw size={13} className={scanning ? "spinning" : ""} />
                {scanning ? "Scanning..." : "Scan Now"}
              </button>
            </div>

            {queueLoading ? (
              <div className="import-empty">
                <RefreshCw size={20} className="spinning" />
              </div>
            ) : queueItems.length === 0 ? (
              <div className="import-empty import-empty-padded">
                <Mail size={36} className="import-empty-icon" />
                <p className="import-empty-title">No reservations in queue</p>
                <p className="import-empty-desc">
                  {scannerStatus?.configured
                    ? "Claude watches your inbox and automatically queues reservation confirmations. Nothing to process right now."
                    : <>Set <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in your .env, then restart the server.</>
                  }
                </p>
                {scannerStatus?.configured && (
                  <button
                    type="button"
                    className="scout-btn scout-btn-scan import-scan-cta"
                    onClick={handleScanNow}
                    disabled={scanning}
                  >
                    <RefreshCw size={13} className={scanning ? "spinning" : ""} />
                    {scanning ? "Scanning..." : "Scan Now"}
                  </button>
                )}
              </div>
            ) : (
              <div className="import-queue-list">
                {queueItems.map(item => {
                  const pd = item.parsed_data?.parsed ?? item.parsed_data;
                  const isAuto = item.status === "auto_queued";
                  const isSelected = selectedItem?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`import-queue-row ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectItem(item)}
                    >
                      <div className="import-queue-row-left">
                        <div className="import-queue-restaurant">
                          {pd?.restaurantName ?? item.email_subject ?? "Unknown reservation"}
                        </div>
                        <div className="import-queue-meta">
                          {pd?.date ? formatDate(pd.date) : "—"}
                          {pd?.time ? ` @ ${pd.time}` : ""}
                          {pd?.partySize ? ` · Party of ${pd.partySize}` : ""}
                        </div>
                        <div className="import-queue-badges">
                          <span className={`import-badge ${item.location_matched ? "success" : "warning"}`}>
                            {item.location_matched ? "AT Match" : "No Match"}
                          </span>
                          {isAuto && (
                            <span className="import-badge auto">
                              <Zap size={9} /> Auto
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="import-queue-row-right">
                        {item.recommended_price != null && (
                          <div className="import-queue-price">
                            {formatCurrency(item.recommended_price)}
                          </div>
                        )}
                        <button
                          type="button"
                          className="import-queue-dismiss"
                          onClick={e => { e.stopPropagation(); handleDismiss(item.id); }}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail / listing creation panel — shown when an item is selected */}
          {selectedItem && parsedData && (
            <ListingPanel
              parsedData={parsedData}
              onCreateListing={handleCreateListing}
              onDismiss={() => { setSelectedItem(null); setParsedData(null); }}
            />
          )}
        </div>
      )}

      {/* ── Manual Paste Tab ── */}
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

            {/* Structured result */}
            {parsedData && !isProcessing && !(parsedData.rawAnalysis && !parsedData.parsed) && (
              <ListingPanel
                parsedData={parsedData}
                onCreateListing={handleCreateListing}
                onDismiss={() => setParsedData(null)}
                showDismiss={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ListingPanel ──────────────────────────────────────────────────────────
// Shared between auto-queue and manual paste: shows parsed details + pricing + actions.

interface ListingPanelProps {
  parsedData: any;
  onCreateListing: (isDryRun: boolean) => Promise<void>;
  onDismiss: () => void;
  showDismiss?: boolean;
}

function ListingPanel({ parsedData, onCreateListing, onDismiss, showDismiss = true }: ListingPanelProps) {
  return (
    <div className="import-listing-column">
      {/* Restaurant match card */}
      <div className="import-panel import-match-panel">
        <div className="import-match-header">
          <div>
            <div className="import-match-name">{parsedData.restaurantName}</div>
            <div className="import-match-meta">
              {formatDate(parsedData.date)} @ {parsedData.time} · Party of {parsedData.partySize}
              <span className="import-match-type">
                {INVENTORY_TYPE_LABELS[parsedData.inventoryTypeID] ?? `Type #${parsedData.inventoryTypeID}`}
              </span>
            </div>
          </div>
          <div className="import-match-actions">
            <span className={`import-badge ${parsedData.locationMatch ? "success" : "warning"}`}>
              {parsedData.locationMatch ? "Match Found" : "No AT Match"}
            </span>
            {showDismiss && (
              <button type="button" className="import-queue-dismiss" onClick={onDismiss} title="Close">×</button>
            )}
          </div>
        </div>

        <div className="import-fields">
          <div className="import-field">
            <label>First Name <span className="import-required">*</span></label>
            <input type="text" defaultValue={parsedData.firstName} onChange={e => parsedData.firstName = e.target.value} className="import-input" placeholder="Required" />
          </div>
          <div className="import-field">
            <label>Last Name <span className="import-required">*</span></label>
            <input type="text" defaultValue={parsedData.lastName} onChange={e => parsedData.lastName = e.target.value} className="import-input" placeholder="Required" />
          </div>
          <div className="import-field">
            <label>Email <span className="import-required">*</span></label>
            <input type="email" defaultValue={parsedData.email} onChange={e => parsedData.email = e.target.value} className="import-input" placeholder="Required" />
          </div>
          <div className="import-field">
            <label>Phone <span className="import-required">*</span></label>
            <input type="tel" defaultValue={parsedData.phone} onChange={e => parsedData.phone = e.target.value} className="import-input" placeholder="+1 555-123-4567 (Required)" />
          </div>
          <div className="import-field">
            <label>Conf Number</label>
            <input type="text" defaultValue={parsedData.confirmationNumber} onChange={e => parsedData.confirmationNumber = e.target.value} className="import-input mono" />
          </div>
          <div className="import-field import-field--full">
            <label>
              Confirmation Screenshot
              <span className="import-required"> *</span>
              <span style={{color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 'var(--text-xs)', marginLeft: 6}}>AT requires a screenshot to review your listing</span>
            </label>
            <ScreenshotUpload
              currentUrl={parsedData.screenshotUrl}
              onUpload={(url) => { parsedData.screenshotUrl = url; }}
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
            <ul>{parsedData.toolCalls.map((tc: any, i: number) => <li key={i}>{tc.name}</li>)}</ul>
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
            <button type="button" className="modal-btn secondary" onClick={() => onCreateListing(true)} disabled={!parsedData.locationMatch}>
              Dry Run
            </button>
            <button type="button" className="modal-btn primary" onClick={() => onCreateListing(false)} disabled={!parsedData.locationMatch}>
              Create Live Listing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
