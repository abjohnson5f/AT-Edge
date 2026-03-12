# AT Edge — Build Plan

**Created:** 03/09/2026
**Updated:** 03/10/2026
**Status:** Phase 4 complete. Phase 5 next.

---

## Completed Phases

### Phase 1: Core Architecture (DONE)
- AT API TypeScript client wrapping ~65 endpoints
- Express server with 14 AT tools + 2 memory tools in Claude agent loop
- 3-tier memory system (Neon Postgres + pgvector)
- React frontend with trading terminal aesthetic

### Phase 2: Trading Terminal UI (DONE)
- TradingView LightweightCharts (candlestick, volume, SMA, conversion, demand)
- DashboardShell with sidebar, header, watchlist, alerts, chart
- Action modals (Fill Bid, Create Listing) with dry run confirmation

### Phase 3: Data Pipeline (DONE)
- `server/collector.ts` — AT API → Neon (4-hour cycle)
- `server/backfill.ts` — One-time seed (8,850 trades, 35 locations, 38 snapshots)
- `server/routes/chartdata.ts` — OHLC, volume, demand from Neon for TradingView
- Per-series data source badges (LIVE DATA / PARTIAL DATA / SIMULATED)

### Phase 4: Production Readiness (DONE — v0.2.1)
- pageSize 50→25 everywhere
- `VITE_USE_MOCK=false`, mock-data.ts deleted
- DashboardShell fetches live data from chart-data + memory/locations
- Account.tsx wired to real transactions API
- AlertsPanel → "Coming Soon" placeholder
- React Router wired for all sidebar pages
- Restaurant profile enrichment (Apify + Claude → Neon cache)
- Watchlist with localStorage persistence

---

## Phase 5: Wire Remaining Pages to Live Data (NEXT)

**Goal:** Make Scout, Import, Portfolio, Price Check, and Account fully functional with real AT API + Neon data. These pages exist but have data contract mismatches between the UI expectations and server responses.

**Version target:** v0.3.0

---

### 5.1 Scout (Market Scout) — DATA CONTRACT FIX

**Problem:** The Scout UI has 5 ranked tables (Highest Converting, Bid/Ask Imbalance, Underserved, Most Viewed, Top List) that expect structured arrays at `data.Payload.rawData.*`. The server's `/api/marketdata/scout` route runs the Claude agent, which returns only free-text markdown in `Payload.report`. The tables render empty; only the "AI Analysis" card works.

**UI expects:**
```ts
data.Payload.rawData.highestConverting: LocationRanking[]
data.Payload.rawData.mostBidsLeastAsks: LocationRanking[]
data.Payload.rawData.underserved: LocationRanking[]
data.Payload.rawData.mostViewedLeastListings: LocationRanking[]
data.Payload.rawData.toplist: LocationRanking[]
data.Payload.report: string           // ✅ Works
data.Payload.generatedAt: string      // ✅ Works
```

**Server returns:**
```ts
{ report: string, toolCalls: [], sessionId: string, generatedAt: string }
```

**Solution — Hybrid approach (direct API + agent analysis):**

1. **Server (`server/routes/marketdata.ts`)**: Modify the `/scout` route to:
   - Make 5 parallel direct AT API calls (`getHighestConvertingLocations`, `getMostBidsLeastAsks`, `getMostUnderservedLocations`, `getMostViewedLeastListings`, `getToplist`) — all with pageSize=25
   - Parse each response's `Payload.ResponseBody.KeyValueList[]` into `LocationRanking[]` arrays
   - Pass the raw data as context to the Claude agent for AI Analysis
   - Return both `rawData` (structured arrays) and `report` (agent markdown)

2. **Response shape:**
```ts
{
  Payload: {
    rawData: {
      highestConverting: LocationRanking[],
      mostBidsLeastAsks: LocationRanking[],
      underserved: LocationRanking[],
      mostViewedLeastListings: LocationRanking[],
      toplist: LocationRanking[],
    },
    report: string,  // Claude's analysis of the raw data
    generatedAt: string,
  }
}
```

3. **UI (`ui/src/pages/Scout.tsx`)**: Already expects this shape — no structural UI changes needed.

4. **Enrich with city data**: Cross-reference with Neon `locations` table to populate `city` field on each ranking.

5. **Label fix**: Column headers say "Location" — change to "Restaurant" per user preference.

**Files to modify:**
- `server/routes/marketdata.ts` — Rewrite `/scout` handler
- `ui/src/pages/Scout.tsx` — "Location" → "Restaurant" labels only

**Depends on:** Nothing (can start immediately)

---

### 5.2 Price Check — DATA CONTRACT FIX

**Problem:** The Price Check UI expects a deeply structured result object (`result.comparables`, `result.metrics`, `result.forecast`), but the server's `/api/marketdata/price-check` route runs the Claude agent and returns `{ analysis: string, toolCalls: [] }`. The entire 3-column results layout renders nothing.

**UI expects:**
```ts
result.comparables.averageCents: number
result.comparables.medianCents: number
result.comparables.count: number
result.comparables.trades: { id, date, priceCents }[]
result.metrics.conversionRate: number
result.metrics.bidToAskRatio: number
result.metrics.avgDaysOnMarket: number
result.metrics.popularityScore: number
result.forecast.recommendedPriceCents: number
result.forecast.profitTargetCents: number
result.forecast.demandLevel: string
result.forecast.yoyChangePercent: number
```

**Server returns:**
```ts
{ analysis: string, toolCalls: [], generatedAt: string }
```

**Solution — Direct API calls for data, agent for forecast:**

1. **Server (`server/routes/marketdata.ts`)**: Rewrite `/price-check` to:
   - **Comparables**: Call AT API `get_comparable_trades` directly → parse into `{ averageCents, medianCents, count, trades[] }`. Note: dateTime MUST be future.
   - **Metrics**: Call AT API `get_metrics` (90-day window) → parse into `{ conversionRate, bidToAskRatio, avgDaysOnMarket, popularityScore }`. This endpoint WORKS for our account.
   - **Forecast**: Pass comparables + metrics as context to Claude agent → instruct it to return structured JSON with `{ recommendedPriceCents, profitTargetCents, demandLevel, yoyChangePercent }`.

2. **UI (`ui/src/pages/PriceCheck.tsx`)**:
   - Replace hardcoded `location` default ("carbone-new-york") with empty string or a dropdown populated from `/api/memory/locations`
   - Add restaurant alias autocomplete using existing `searchLocations` API function
   - Replace "Location Alias" label with "Restaurant"
   - Add validation: date must be in the future (AT API constraint for comps)
   - Handle case where AT API returns no comparable trades gracefully

3. **Edge case handling**:
   - If `get_comparable_trades` returns 403 (past date), show clear message
   - If `get_metrics` returns "No available metrics", show empty metrics card
   - If agent fails, still show raw comps + metrics without forecast

**Files to modify:**
- `server/routes/marketdata.ts` — Rewrite `/price-check` handler
- `ui/src/pages/PriceCheck.tsx` — Restaurant autocomplete, label fixes, future-date validation
- `ui/src/api/location.ts` — May need `getLocations()` function for dropdown

**Depends on:** Nothing (can start immediately)

---

### 5.3 Portfolio — WIRE DROPDOWN ACTIONS

**Problem:** The Portfolio page loads listings correctly from `GET /api/portfolio/listings` and the AI Review renders agent markdown properly. However, the three dropdown actions (Reprice, Toggle Visibility, Archive) are **dead buttons** — they render in the menu but have no `onClick` handlers.

**What works:**
- ✅ Listing table fetches from live AT API
- ✅ AI Review button triggers Claude agent, renders markdown
- ✅ Summary cards (Total Value, Active Listings, Expiring < 48h) compute from real data

**What needs wiring:**

1. **Reprice action**:
   - Click opens a modal/dialog with current price + input for new price
   - On confirm, calls `updateListingPrice(listingID, newPriceCents, execute)` (already exists in `ui/src/api/listing.ts`)
   - Respects dry run: first call with `execute=false`, show confirmation, then `execute=true`
   - Invalidate `["listings"]` query on success

2. **Toggle Visibility action**:
   - Click calls `toggleVisibility(listingID, !currentVisibility, execute)` (already exists)
   - Same dry run pattern
   - Update the "Hidden" badge in the table

3. **Archive action**:
   - Click shows confirmation dialog ("Are you sure? This cannot be undone.")
   - Calls `archiveListing(listingID, execute)` (already exists)
   - Remove from table on success

4. **Toast feedback**: Use existing `useToast` for success/error messages on all actions.

**Files to modify:**
- `ui/src/pages/Portfolio.tsx` — Add onClick handlers + modals for all 3 actions

**Depends on:** Nothing (can start immediately)

---

### 5.4 Import — VERIFY & POLISH

**Problem:** The Import page is the most complete of the 5 — the Claude agent is explicitly instructed to return structured JSON, and the server parses it. However, it hasn't been tested end-to-end with a real email and there are a few gaps.

**What works:**
- ✅ Manual Paste tab with textarea
- ✅ Processing pipeline steps UI
- ✅ Agent parsing → structured JSON with location match + pricing
- ✅ Parsed result card with editable fields
- ✅ Pricing strategy card with recommended price + AI reasoning
- ✅ Dry Run / Create Live Listing buttons call `POST /api/location/:alias/listing`
- ✅ Server persists to Neon (imports table + location upsert)

**What needs work:**

1. **Gmail Sync tab**: Currently shows "Gmail integration requires OAuth setup" placeholder. Leave as-is for now — mark as Phase 6 (requires Google Cloud Console OAuth setup).

2. **Inventory type display**: The parsed result shows `inventoryTypeID` as a number. Add a readable label (e.g., "Transfer" or "Reservation") — the mapping comes from `get_inventory_types` for the matched location.

3. **Date formatting**: Parsed dates display as YYYY-MM-DD. Reformat to MM/DD/YYYY per user preference.

4. **End-to-end test**: Manually test with a sample reservation email to verify the full flow works with the live AT API.

5. **Error recovery**: If agent returns unparseable JSON (falls to `rawAnalysis` branch), show the raw text in a readable format instead of broken UI.

**Files to modify:**
- `ui/src/pages/Import.tsx` — Date formatting, inventory type label, rawAnalysis fallback display

**Depends on:** Nothing (can start immediately)

---

### 5.5 Account — MINOR FIXES

**Problem:** The Account page was already updated in Phase 4 to use real transaction data from the AT API. It's the most production-ready of the 5 pages.

**What works:**
- ✅ Account cards with real balance, credit limit, currency
- ✅ Transaction table fetches from `GET /api/account/transactions`
- ✅ Loading and empty states

**What needs fixing:**

1. **pageSize in UI client**: `ui/src/api/account.ts` line 8 has `pageSize = 50` default. Change to 25 (AT API max).

2. **Add user details**: Call `GET /api/account/details` (already exists on server) to show user profile info (name, email, membership status) above the account cards.

3. **Date formatting**: Transaction dates use `.toLocaleDateString()` which gives inconsistent results. Use the project's `formatDate()` utility from `lib/utils.ts` for consistent MM/DD/YYYY formatting.

4. **Amount display**: Verify that transaction amounts are in cents and being divided by 100 correctly via `formatCurrency()`.

**Files to modify:**
- `ui/src/api/account.ts` — pageSize 50→25
- `ui/src/pages/Account.tsx` — Add user details section, use formatDate()

**Depends on:** Nothing (can start immediately)

---

## Execution Order & Parallelism

All 5 tasks are **independent** and can be worked in parallel. If doing sequentially, prioritize by impact:

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | **5.1 Scout** | Medium | Biggest page — 5 data tabs currently empty |
| 2 | **5.2 Price Check** | Medium | Core feature — entire results page broken |
| 3 | **5.3 Portfolio** | Small | Actions are dead buttons, but table works |
| 4 | **5.4 Import** | Small | Mostly works, needs testing + polish |
| 5 | **5.5 Account** | Tiny | Almost done, just pageSize + formatting |

**Estimated scope:** ~5 files modified on server, ~5 files modified on UI. No new tables or endpoints needed — all server routes already exist.

---

## Phase 6: Future Enhancements (BACKLOG)

### 6.1 Alert System (full build)
- `alerts` table, CRUD routes, collector-triggered alerts
- Replace AlertsPanel "Coming Soon" with real alerts

### 6.2 Gmail OAuth Pipeline
- Google Cloud Console OAuth setup
- End-to-end: email → parse → pricing → listing creation

### 6.3 Memory/Intelligence Page
- New UI page showing the 3-tier memory system
- Tacit knowledge browser, session log viewer, knowledge graph explorer

### 6.4 pgvector Embeddings
- Semantic search across all memory tiers
- Enable `/api/memory/search` endpoint

### 6.5 Automated Cron Jobs
- Decay cycle: `update_decay_tiers()` nightly
- Scout: automated market scan on schedule
- Bid monitor: detect profitable fill opportunities

---

## AT API Constraints (Discovered via Live Testing)

| Constraint | Detail |
|------------|--------|
| **Max pageSize** | 25 (account permission `MaximumMarketDataResults`) |
| **API key type** | Production key required |
| **Comparable trades** | ONLY works with future dates (past = 403) |
| **Response format** | Nested: `Payload.ResponseBody.KeyValueList[]` with string values |
| **Prices** | Always in smallest currency unit (cents) |
| **get_metric_history** | Returns "No available metrics" for this account |
| **get_highest_converting** | Returns "No available metrics" for this account |
| **get_metrics** | WORKS — LowPrice, HighPrice, AveragePrice, TransactionCount, ActiveBids, PageVisitors |
| **Bids** | 5-minute reporting delay |
| **Write safety** | `isWritingRequest` defaults to `false` (dry run) |
| **Auth** | `api_token` as query param, NOT Bearer header |
