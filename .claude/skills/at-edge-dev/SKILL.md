---
name: at-edge-dev
description: "AT Edge development assistant. Use when working on the AT Edge reservation trading application. Loads project context, AT API constraints, current build plan, and production blockers so you can start coding immediately without discovery. Triggers on: at-edge, trading terminal, AT API, reservation trading, appointment trader."
---

# AT Edge Development Context

You are working on AT Edge — an intelligent market-making application for AppointmentTrader (a reservation trading marketplace). It combines the AT REST API with the Claude Agent SDK.

## Quick Start

Before doing anything, read these files to understand current state:

1. **Build plan:** `/Users/alexjohnson/AVGJ Apps/at-edge/PLAN.md` — Current phase, exact tasks, file locations
2. **Project architecture:** `/Users/alexjohnson/AVGJ Apps/at-edge/CLAUDE.md` — Full architecture, endpoints, schema
3. **Memory index:** Check `.claude/projects/-Users-alexjohnson-AVGJ-Apps-at-edge/memory/MEMORY.md`

## Critical AT API Rules

These are non-negotiable constraints discovered via live testing:

1. **pageSize max is 25** — The account permission `MaximumMarketDataResults` caps at 25. Requesting more returns a 400 error.
2. **Comparable trades require FUTURE dates only** — Past dates return 403 "Must be a future date."
3. **Response format is nested** — `Payload.ResponseBody.KeyValueList[]` with STRING values. Must parseInt/parseFloat.
4. **Auth is query param** — `?key=xxx`, NOT Bearer header.
5. **Prices are in cents** — All `priceAmountInSmallestUnit` fields are cents. Divide by 100 for display.
6. **`get_metric_history` and `get_highest_converting` don't work** — Return "No available metrics" for this account.
7. **`get_metrics` DOES work** — Returns LowPrice, HighPrice, AveragePrice, TransactionCount, ActiveBids, PageVisitors as a single object.

See memory file `at-api-patterns.md` for full details.

## Current Phase: Phase 4 (Production Readiness)

7 items to complete. See `production-blockers.md` in memory for exact file paths and line numbers.

Priority order:
1. Fix pageSize 50→25 in server routes + agent tools
2. Set VITE_USE_MOCK=false
3. Replace MOCK_RESTAURANTS with API data
4. Wire Account transactions to real endpoint
5. Wire Dashboard stats to real data
6. Alert system (placeholder or build)
7. Delete mock-data.ts

## Project Structure

```
at-edge/
├── src/api/          # AT API TypeScript client (~65 endpoints)
├── server/           # Express API + Claude agent loop
│   ├── agent.ts      # Agentic loop: 14 AT tools + 2 memory tools
│   ├── collector.ts  # Data pipeline: AT API → Neon
│   ├── backfill.ts   # One-time seed script
│   ├── routes/       # API routes (marketdata, listing, portfolio, etc.)
│   └── db/           # Neon client, memory system, migration
├── ui/               # React + Vite + TradingView charts
│   └── src/
│       ├── components/trading/  # Trading terminal components
│       ├── pages/              # Dashboard, Scout, Import, Portfolio, etc.
│       ├── api/                # Frontend API client (has mock fallbacks)
│       └── styles/             # dashboard.css (primary styles)
└── PLAN.md           # Current build plan with all details
```

## Environment

- UI: port 4000 | Server: port 3001
- Neon project: `plain-term-05120283`
- DB: 12 tables, 3 views, daily_ohlc, pgvector
- Data: 8,850 trades, 35 locations, 38 snapshots (as of 03/09/2026)
- Collection: runs every 4 hours automatically

## Commands

```bash
npm run dev          # Server (3001) + UI (4000)
npm run server       # Server only
npm run ui           # UI only
npm run build        # TypeScript check
npm run backfill     # One-time data seed
```

## Don't Forget

- DRY_RUN=true is the default — all write operations are safe
- The PriceChart has per-series data source tracking (LIVE/PARTIAL/SIMULATED badges)
- Mock data generators in PriceChart are intentional fallbacks — don't delete them
- The collector has early-bail on Unknown Alias errors
- `rao-s-new-york` is not a valid AT alias (Rao's may not be on the platform)
