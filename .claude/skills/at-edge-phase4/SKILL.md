---
name: at-edge-phase4
description: "Execute AT Edge Phase 4 (Production Readiness) using parallel subagents. Spawns 3 independent agents to fix server pageSize, wire live UI data, and clean up mocks — all simultaneously. Use when ready to make AT Edge production-ready. Triggers on: phase 4, production ready, go live, remove mocks, at-edge production."
---

# AT Edge Phase 4: Production Readiness Execution

## Project Context (for the orchestrating agent)

AT Edge is an intelligent market-making application for AppointmentTrader (reservation trading). It combines the AT REST API with the Claude Agent SDK.

### Critical AT API Rules

These are non-negotiable constraints discovered via live testing:

1. **pageSize max is 25** — Account permission `MaximumMarketDataResults` caps at 25. Requesting more returns 400.
2. **Comparable trades require FUTURE dates only** — Past dates return 403.
3. **Response format is nested** — `Payload.ResponseBody.KeyValueList[]` with STRING values. Must parseInt/parseFloat.
4. **Auth is query param** — `?key=xxx`, NOT Bearer header.
5. **Prices are in cents** — All `priceAmountInSmallestUnit` fields. Divide by 100 for display.
6. **`get_metric_history` and `get_highest_converting` don't work** — "No available metrics" for this account.
7. **`get_metrics` DOES work** — Returns LowPrice, HighPrice, AveragePrice, TransactionCount, ActiveBids, PageVisitors.

### Project Structure

```
at-edge/
├── src/api/          # AT API TypeScript client (~65 endpoints)
├── server/           # Express API + Claude agent loop
│   ├── agent.ts      # Agentic loop: 14 AT tools + 2 memory tools
│   ├── collector.ts  # Data pipeline: AT API → Neon
│   ├── backfill.ts   # One-time seed script (already ran)
│   ├── routes/       # API routes (marketdata, listing, portfolio, chartdata, etc.)
│   └── db/           # Neon client, memory system, migration
├── ui/               # React + Vite + TradingView charts
│   └── src/
│       ├── components/trading/  # Trading terminal (DashboardShell, PriceChart, etc.)
│       ├── pages/              # Dashboard, Scout, Import, Portfolio, Account
│       ├── api/                # Frontend API client (currently has mock fallbacks)
│       └── styles/             # dashboard.css
├── PLAN.md           # Full build plan with all phase details
└── CLAUDE.md         # Full architecture reference
```

### Environment

- UI: port 4000 | Server: port 3001
- Neon project: `plain-term-05120283`
- DB: 12 tables, 3 views, daily_ohlc, pgvector
- Data: 8,850 trades, 35 locations, 38 snapshots (collected 03/09/2026)
- Collection: runs every 4 hours via setInterval in server/index.ts
- DRY_RUN=true is default — all write operations are safe

### Key Rules

- PriceChart mock generators are INTENTIONAL fallbacks with SIMULATED badges — never delete them
- `rao-s-new-york` is not a valid AT alias
- The collector has early-bail on Unknown Alias errors
- Memory files at `.claude/projects/-Users-alexjohnson-AVGJ-Apps-at-edge/memory/` have additional details

---

## Execution Instructions

When this skill is invoked, you MUST immediately launch 3 parallel subagents using the Agent tool. Do NOT do the work yourself — delegate to agents for maximum parallelism.

1. Tell the user: "Launching 3 parallel agents for Phase 4 (pageSize fix, live data wiring, dashboard cleanup). Agent D (mock removal) will run after they complete."

2. Launch Agents A, B, and C simultaneously using 3 Agent tool calls in a SINGLE message.

3. When all 3 complete, launch Agent D.

4. After Agent D completes, run both TypeScript checks yourself to confirm everything compiles:
   - `cd "/Users/alexjohnson/AVGJ Apps/at-edge" && npx tsc --noEmit`
   - `cd "/Users/alexjohnson/AVGJ Apps/at-edge/ui" && npx tsc --noEmit`

5. Report results to the user with a summary of what changed.

---

## Agent A: Server-side pageSize fix

```prompt
You are working on the AT Edge project at "/Users/alexjohnson/AVGJ Apps/at-edge".

Read these files first:
- server/routes/marketdata.ts
- server/agent.ts
- server/routes/bid.ts

TASK: Fix all pageSize defaults from 50 to 25. The AT API account limit is 25 — requesting more returns a 400 error.

EXACT CHANGES NEEDED:

1. server/routes/marketdata.ts:
   - Line 28: In the agent prompt string, change "pageSize=50" to "pageSize=25"
   - Lines 68, 80, 92, 104, 116: Change `req.query.pageSize ?? 50` to `req.query.pageSize ?? 25`

2. server/agent.ts:
   - Tool description strings that say "default 50" → change to "default 25"
   - All lines with `(input.pageSize as number) ?? 50` → change to `?? 25`
   - The bid list line with `?? 100` → change to `?? 25`

3. server/routes/bid.ts:
   - Line 12: Change `?? 100` to `?? 25`

After changes, verify: cd "/Users/alexjohnson/AVGJ Apps/at-edge" && npx tsc --noEmit

Do NOT modify any other files. Do NOT commit.
```

## Agent B: DashboardShell + WatchlistPanel live data

```prompt
You are working on the AT Edge project at "/Users/alexjohnson/AVGJ Apps/at-edge".

Read these files first:
- ui/src/components/trading/DashboardShell.tsx
- server/routes/chartdata.ts (to understand the API response format)
- server/routes/memory.ts (to understand the locations API)

TASK: Replace the hard-coded MOCK_RESTAURANTS array in DashboardShell.tsx with data fetched from the live API.

The Restaurant interface is:
{ alias: string; name: string; city: string; cuisineType: string; avgPriceCents: number; changePct: number; color: string; }

IMPLEMENTATION:
1. Add a useEffect + useState that fetches from two endpoints on mount:
   - GET http://localhost:3001/api/chart-data/ → returns { locations: [{ alias, tradeCount, firstTrade, lastTrade }] }
   - GET http://localhost:3001/api/memory/locations → returns locations with name, city info
2. Merge the two responses to build Restaurant[] objects
3. For fields not available from API:
   - cuisineType: default to "Restaurant" (can be enriched later)
   - changePct: default to 0 (needs multi-day OHLC data to calculate)
   - color: generate deterministically from alias using a hash function (same pattern as PriceChart's seeded random)
   - avgPriceCents: if available from chart-data, use last close * 100; otherwise default to 10000
4. Keep the current MOCK_RESTAURANTS as a FALLBACK_RESTAURANTS constant — use it if both API calls fail
5. Show a loading state while fetching
6. The API base URL should use: const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'

After changes, verify: cd "/Users/alexjohnson/AVGJ Apps/at-edge/ui" && npx tsc --noEmit

Do NOT modify any other files. Do NOT commit.
```

## Agent C: Dashboard + Account live data

```prompt
You are working on the AT Edge project at "/Users/alexjohnson/AVGJ Apps/at-edge".

Read these files first:
- ui/src/pages/Dashboard.tsx
- ui/src/pages/Account.tsx
- ui/src/api/account.ts
- server/routes/account.ts

TASK: Replace hard-coded mock data in Dashboard.tsx and Account.tsx with real API calls.

DASHBOARD.TSX CHANGES:
1. Line 21: Replace `const pendingImports = 3` with `const pendingImports = 0` (no import tracking yet)
2. Lines 26-29: Replace Math.random() performanceData with an empty array or a simple "No performance data yet" message. Do NOT use Math.random().
3. Lines 31-36: Replace the hard-coded recentActivity array with an empty state: "No recent activity" message
4. Line 52: Change "+2.1% from last month" to just show the balance without a fake percentage
5. Line 62: Replace `formatCurrency(150000)` with a calculation from listingsData if available, or "—" if not
6. Lines 111-113: Keep the badges but make them conditional on actual data fields (bidCount, conversionRate, etc.) rather than assigned by index
7. Lines 117-119: Replace `i % 3` trend arrows with actual score-based logic or just use a neutral Minus icon for all

ACCOUNT.TSX CHANGES:
1. Replace mockTransactions (lines 12-17) with a TanStack Query call:
   - Add: import { apiGet } from "../api/client"
   - Add a query: useQuery({ queryKey: ["transactions"], queryFn: () => apiGet("/account/transactions") })
   - The AT API returns transactions in its standard response format
   - Handle loading and empty states
   - If the API call fails or returns no data, show "No transaction history available"

IMPORTANT: Do NOT import from mock-data.ts. Do NOT use Math.random(). All data must come from API calls or show honest empty states.

After changes, verify: cd "/Users/alexjohnson/AVGJ Apps/at-edge/ui" && npx tsc --noEmit

Do NOT modify any other files. Do NOT commit.
```

## Agent D: Mock cleanup (run AFTER A, B, C complete)

```prompt
You are working on the AT Edge project at "/Users/alexjohnson/AVGJ Apps/at-edge".

Read these files first:
- ui/.env
- ui/src/api/client.ts
- ui/src/api/mock-data.ts
- ui/src/api/marketdata.ts
- ui/src/api/listing.ts
- ui/src/api/portfolio.ts
- ui/src/api/account.ts
- ui/src/api/bid.ts
- ui/src/api/location.ts
- ui/src/components/trading/AlertsPanel.tsx

TASK: Clean up all mock data infrastructure. Previous agents have already wired real data.

CHANGES:
1. ui/.env: Change VITE_USE_MOCK=true to VITE_USE_MOCK=false

2. ui/src/components/trading/AlertsPanel.tsx: Replace the entire MOCK_ALERTS array and rendering with a "Coming Soon" placeholder. Keep the panel structure (header with "Alerts" title, tabs) but show a centered message: "Alert system coming soon. Alerts will trigger on bid imbalances, price thresholds, and new listings at watched locations."

3. Delete ui/src/api/mock-data.ts entirely

4. ui/src/api/client.ts: Remove the mockApiCall function and the `import { sleep }` line

5. For each of these files, remove the USE_MOCK import, the mock-data import, and the USE_MOCK conditional branch — keep ONLY the real API call path:
   - ui/src/api/marketdata.ts
   - ui/src/api/listing.ts
   - ui/src/api/portfolio.ts
   - ui/src/api/account.ts
   - ui/src/api/bid.ts
   - ui/src/api/location.ts

6. Do NOT touch ui/src/components/trading/PriceChart.tsx — its mock generators are intentional fallbacks with SIMULATED badges.

After changes, verify BOTH compile:
cd "/Users/alexjohnson/AVGJ Apps/at-edge" && npx tsc --noEmit
cd "/Users/alexjohnson/AVGJ Apps/at-edge/ui" && npx tsc --noEmit

Do NOT commit.
```
