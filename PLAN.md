# AT Edge — Production Readiness Build Plan

**Created:** 03/09/2026
**Status:** Active — Phase 3 complete, Phase 4 next
**Last Session:** Backfill complete (8,850 trades, 33 locations, 38 snapshots in Neon)

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
- Deterministic seeded PRNG for stable mock data
- Action modals (Fill Bid, Create Listing) with dry run confirmation
- Keyboard shortcuts (S/I/P)

### Phase 3: Data Pipeline (DONE)
- `server/collector.ts` — Pulls market data from AT API, stores in Neon
- `server/backfill.ts` — One-time seed script (ran successfully 03/09/2026)
- `server/routes/chartdata.ts` — Serves OHLC, volume, SMA, conversion, demand from Neon
- `daily_ohlc` SQL view for candlestick aggregation
- 4-hour periodic collection via `setInterval` in server/index.ts
- Per-series data source badges (LIVE DATA / PARTIAL DATA / SIMULATED)
- Data source banner showing which series need more history
- Early-bail on Unknown Alias errors in collector

---

## Phase 4: Production Readiness (NEXT — 7 items)

### 4.1 Fix pageSize defaults (50 → 25) — BLOCKS ALL LIVE API CALLS
**AT API account limit is 25 results max.** Every route and agent tool defaults to 50, causing 400 errors.

**Files to fix:**
- `server/routes/marketdata.ts` — Lines 68, 80, 92, 104, 116: change `?? 50` to `?? 25`
- `server/routes/marketdata.ts` — Line 28: agent prompt says `pageSize=50`, change to 25
- `server/agent.ts` — Lines 209, 215, 221, 227, 233: change `?? 50` to `?? 25`
- `server/agent.ts` — Lines 22, 34, 46, 58, 69: tool descriptions say "default 50", change to 25
- `server/agent.ts` — Line 283 (bid list): `?? 100` → `?? 25`
- `server/routes/account.ts` — Line 33: `?? 50` is fine (transactions, different endpoint)
- `server/routes/bid.ts` — Line 12: `?? 100` → `?? 25`

### 4.2 Set VITE_USE_MOCK=false
**File:** `ui/.env` — Change `VITE_USE_MOCK=true` to `VITE_USE_MOCK=false`
This instantly makes all UI API functions call the real server instead of mock data.

### 4.3 Replace MOCK_RESTAURANTS with API-fetched locations
**File:** `ui/src/components/trading/DashboardShell.tsx`

Currently has hard-coded `MOCK_RESTAURANTS` array (5 restaurants with fabricated prices, changePct, cuisineType). This drives the entire trading terminal: watchlist, tabs, ticker, chart selection.

**Solution:** Fetch from `GET /api/chart-data/` (returns all locations with trade counts) merged with `GET /api/memory/locations` (returns location names). Build Restaurant objects from real data. Fall back to hard-coded list only if both API calls fail.

**Data mapping:**
- `alias` → from API
- `name` → from locations API or derive from alias
- `city` → from locations API
- `cuisineType` → not available from AT API; options: (a) hard-code a lookup table, (b) add to locations table via agent, (c) leave as "Restaurant"
- `avgPriceCents` → from chart-data API (last close price or average)
- `changePct` → calculate from OHLC (today close vs yesterday close), or 0 if only 1 day
- `color` → generate deterministically from alias hash

### 4.4 Wire Account transactions to real endpoint
**File:** `ui/src/pages/Account.tsx`

Has `mockTransactions` array (4 fake records). Server already has `GET /api/account/transactions` that hits AT API.

**Solution:** Add TanStack Query call to `/api/account/transactions`, replace mock array.

### 4.5 Wire Dashboard stats to real data
**File:** `ui/src/pages/Dashboard.tsx`

Hard-coded items:
- `pendingImports = 3` → Query imports table or just show 0 / remove
- `performanceData` (30 days, Math.random()) → Query `pnl_summary` view or chart-data
- `recentActivity` (4 fake items) → Query `agent_sessions` table (last 5 sessions)
- `formatCurrency(150000)` → Sum of listing prices from portfolio API
- Signal badges assigned by index → Use actual data fields
- Trend arrows by `i % 3` → Calculate from actual score changes
- `"+2.1% from last month"` → Calculate from real balance history or remove

### 4.6 Build alert system or mark as "Coming Soon"
**File:** `ui/src/components/trading/AlertsPanel.tsx`

Has `MOCK_ALERTS` (10 fake alerts). No server endpoint exists.

**Options:**
1. **Quick:** Replace content with "Alerts — Coming Soon" placeholder with description
2. **Full build:** Create `alerts` table, `GET/POST/PATCH /api/alerts` routes, alert generation logic in collector (bid imbalance detection, price threshold monitoring)

**Recommended:** Quick placeholder for now, build real alerts as Phase 5.

### 4.7 Clean up mock infrastructure
Once 4.1-4.6 are done:
- Delete `ui/src/api/mock-data.ts`
- Remove `mockApiCall` from `ui/src/api/client.ts`
- Remove all `USE_MOCK` branches from `ui/src/api/*.ts`
- Remove `VITE_USE_MOCK` from env files and vite config
- Keep PriceChart mock generators (they serve as fallback for insufficient data, clearly labeled)

---

## Phase 5: Feature Completion (FUTURE)

### 5.1 Alert System (full build)
- `alerts` table: type, location_alias, condition, threshold, status, triggered_at
- `GET/POST/PATCH/DELETE /api/alerts` routes
- Collector detects: bid imbalance alerts, price spike/drop, new listings at watched locations
- AlertsPanel renders from API

### 5.2 Watchlist Persistence
- `watchlist` table: location_alias, sort_order, added_at
- `GET/POST/DELETE /api/watchlist` routes
- WatchlistPanel reads from API instead of MOCK_RESTAURANTS

### 5.3 Location Profile Modal
- 5 tabs: Profile, Intelligence, Trades, Listings, Metrics
- Uses: location_facts, trades, listings, AT API get_metrics
- Link from WatchlistPanel and RestaurantDetailCard

### 5.4 Gmail OAuth Pipeline
- Google Cloud Console setup
- OAuth consent screen + refresh token generation
- End-to-end: email → parse → pricing → listing creation

### 5.5 Embedding Pipeline (pgvector)
- `memory_embeddings` table exists but nothing writes to it
- Add embedding calls when storing facts/sessions
- Enable semantic search via `/api/memory/search`

### 5.6 Automated Cron Jobs
- Decay cycle: `update_decay_tiers()` nightly
- Scout: automated market scan on schedule
- Bid monitor: detect profitable fill opportunities

---

## AT API Constraints (Discovered via Live Testing)

| Constraint | Detail |
|------------|--------|
| **Max pageSize** | 25 (account permission `MaximumMarketDataResults`) |
| **API key type** | Production key required (sandbox key rejected on production endpoint) |
| **Comparable trades** | ONLY works with future dates (`dateTime` must be future) |
| **Response format** | Nested: `Payload.ResponseBody.KeyValueList[]` with string values |
| **MetaInformation** | Contains `average_priceAmountInSmallestUnit`, `low_`, `high_` |
| **Prices** | Always in smallest currency unit (cents for USD) |
| **get_metric_history** | Returns "No available metrics" for this account |
| **get_highest_converting** | Returns "No available metrics" for this account |
| **get_metrics** | WORKS — returns LowPrice, HighPrice, AveragePrice, TransactionCount, ActiveBids, etc. |
| **Bids** | 5-minute reporting delay |
| **Write safety** | `isWritingRequest` defaults to `false` (dry run) |
| **Auth** | `api_token` as query param, NOT Bearer header |

---

## Data Pipeline Status (as of 03/09/2026)

| Metric | Value |
|--------|-------|
| Trades in Neon | 8,850 |
| Locations | 35 |
| Market snapshots | 38 (33 price curves + 5 market rankings) |
| OHLC days | 33 (1 per location — builds daily) |
| Demand index locations | 31 |
| SMA availability | Needs 20+ collection days |
| Collection interval | Every 4 hours (server/index.ts setInterval) |

---

## Key File Index

| File | Purpose | Status |
|------|---------|--------|
| `server/collector.ts` | AT API → Neon data pipeline | Production-ready |
| `server/backfill.ts` | One-time seed script | Ran successfully |
| `server/routes/chartdata.ts` | Chart data API from Neon | Production-ready |
| `server/agent.ts` | Claude agentic loop + 14 tools | Needs pageSize fix |
| `server/routes/marketdata.ts` | Market data routes | Needs pageSize fix |
| `server/db/migration.sql` | Schema + daily_ohlc view | Production-ready |
| `ui/src/components/trading/PriceChart.tsx` | TradingView chart + data source badges | Production-ready |
| `ui/src/components/trading/DashboardShell.tsx` | Trading terminal shell | Needs live data (4.3) |
| `ui/src/components/trading/AlertsPanel.tsx` | Alerts panel | Fully mocked (4.6) |
| `ui/src/pages/Dashboard.tsx` | Overview dashboard | Partially mocked (4.5) |
| `ui/src/pages/Account.tsx` | Account management | Partially mocked (4.4) |
| `ui/src/api/mock-data.ts` | Mock data for dev mode | Delete after 4.7 |
