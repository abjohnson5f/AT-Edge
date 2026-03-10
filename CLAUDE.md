# AT Edge — Handoff Document

**Last Updated:** 03/09/2026
**Location:** `/Users/alexjohnson/AVGJ Apps/at-edge/`
**Status:** Phase 3 complete (data pipeline live, 8,850 trades in Neon). Phase 4 next (production readiness).

**Build Plan:** See `PLAN.md` for current phase details and exact task list.
**Memory:** See `.claude/projects/.../memory/` for AT API patterns, production blockers.
**Skill:** `/at-edge-dev` loads full project context for new sessions.
**Subagent prompts:** `.claude/agents/at-edge-production-agent.md` for parallelized Phase 4 work.

---

## What Is This

AT Edge is an intelligent market-making application for [AppointmentTrader](https://appointmenttrader.com) (a reservation trading marketplace). It combines the AT REST API with the Claude Agent SDK to create a competitive advantage tool for identifying opportunities, importing reservations, managing portfolio, and making data-driven pricing decisions.

**The user has explicitly stated:** "I have absolutely zero intention to operate outside of the TOS for AppointmentTrader." This is a legitimate programmatic approach to the platform.

---

## Architecture

```
┌──────────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│  React Frontend  │────▶│  Express API Server     │────▶│  AT API          │
│  (Vite, port 3000)│    │  (port 3001)            │     │  appointmenttrader.com/v1
│                  │     │                         │     └─────────────────┘
│  TanStack Query  │     │  Claude Agent SDK       │
│  shadcn/ui       │     │  (agentic loop w/ tools)│────▶┌─────────────────┐
│  Tailwind CSS    │     │                         │     │  Neon Postgres   │
│  Recharts        │     │  3-Tier Memory System   │     │  (pgvector)      │
└──────────────────┘     └─────────────────────────┘     └─────────────────┘
```

**Three-tier system:**
1. **UI** (`ui/`) — React SPA with trading terminal aesthetic (dark theme, zinc palette)
2. **Server** (`server/`) — Express API that proxies AT API calls and adds Claude intelligence
3. **AT API Client** (`src/api/`) — TypeScript client wrapping all ~65 AT API endpoints

---

## File Structure

```
at-edge/
├── .env.example              # All required env vars (copy to .env)
├── package.json              # Root: server deps + scripts
├── tsconfig.json             # ES2022, NodeNext, strict
│
├── src/                      # AT API Client Layer
│   ├── config.ts             # Environment config (AT, Anthropic, Gmail, DB)
│   ├── index.ts              # CLI entry point (scout, import, portfolio, price-check)
│   ├── api/
│   │   ├── client.ts         # Core ATClient class (auth via api_token query param)
│   │   ├── types.ts          # Full TypeScript types (ATResponse, Listing, Bid, etc.)
│   │   ├── index.ts          # ATAPI facade combining all endpoint modules
│   │   └── endpoints/
│   │       ├── marketdata.ts # 6 market data endpoints
│   │       ├── location.ts   # Location search, metrics, comps, listing creation
│   │       ├── listing.ts    # Competing listings, price changes, visibility, bid filling
│   │       ├── portfolio.ts  # Portfolio listings, order lists
│   │       ├── bid.ts        # Bid listing, placement, cancellation
│   │       └── account.ts    # Account balances, user details, transactions
│   ├── agents/               # Standalone agent modules (pre-server, CLI-oriented)
│   │   ├── scout.ts          # Market intelligence agent
│   │   ├── importer.ts       # Email → parsed reservation → pricing
│   │   └── portfolio.ts      # Portfolio review agent
│   └── email/
│       ├── parser.ts         # Claude-powered email parsing
│       └── gmail.ts          # Gmail API (label-based: AT-Import → AT-Processed)
│
├── server/                   # Express API Server
│   ├── index.ts              # Server entry: CORS, routes, DB init, health/config endpoints
│   ├── agent.ts              # ★ THE KEY FILE: Claude agentic loop + 14 AT tools + 2 memory tools
│   ├── db/
│   │   ├── migration.sql     # Full schema: 12 tables, 3 views, decay function
│   │   ├── client.ts         # Neon connection pool, query helpers, migration runner
│   │   ├── memory.ts         # 3-tier memory read/write API (~350 lines)
│   │   └── index.ts          # Barrel export
│   └── routes/
│       ├── marketdata.ts     # Scout (agent), price-check (agent), + 5 direct AT proxies
│       ├── location.ts       # Search, inventory types, metrics, comps, listing creation
│       ├── listing.ts        # Price updates, visibility toggle, bid filling, archiving
│       ├── portfolio.ts      # Portfolio listing + agent-powered review
│       ├── bid.ts            # Bid listing
│       ├── account.ts        # Account balances, details, transactions
│       ├── import.ts         # ★ Email parsing via Claude agent → structured import
│       ├── agent.ts          # Freeform agent chat endpoint
│       └── memory.ts         # Memory management API (8 endpoints)
│
├── ui/                       # React Frontend (originally built by Google AI Studio, rewired)
│   ├── package.json          # Renamed to at-edge-ui, Gemini deps removed
│   ├── vite.config.ts        # @alias, Tailwind v4, HMR toggle
│   ├── tsconfig.json         # Bundler resolution, includes src/
│   ├── index.html            # Title: "AT Edge"
│   └── src/
│       ├── vite-env.d.ts     # Vite client types
│       ├── main.tsx           # React entry with QueryClientProvider
│       ├── App.tsx            # Router setup
│       ├── api/
│       │   ├── client.ts     # apiGet/apiPost → http://localhost:3001/api + mockApiCall
│       │   ├── marketdata.ts # getScoutReport, getPriceCheck (mock + live)
│       │   ├── listing.ts    # getListings, updateListingPrice, toggleVisibility, archive
│       │   ├── portfolio.ts  # getPortfolioReview
│       │   ├── account.ts    # getAccounts
│       │   ├── bid.ts        # getBids
│       │   ├── location.ts   # searchLocations, getInventoryTypes
│       │   └── mock-data.ts  # Realistic mock data (Carbone, French Laundry, Nobu, etc.)
│       ├── pages/
│       │   ├── Dashboard.tsx # Overview: accounts, listings, bids, scout summary, chart
│       │   ├── Scout.tsx     # 5-tab market data + Claude AI Analysis (markdown)
│       │   ├── Import.tsx    # ★ Forward-and-forget: paste email → agent parses → pricing → listing
│       │   ├── Portfolio.tsx # Listing table with dropdown actions, AI Review modal
│       │   ├── PriceCheck.tsx# Location/date/time → 3-column results (comps, metrics, forecast)
│       │   └── Account.tsx   # Account cards + transaction history
│       ├── components/
│       │   ├── layout/       # AppLayout (keyboard shortcuts S/I/P), Sidebar, TopBar
│       │   └── ui/           # shadcn components + custom variants (success, warning)
│       ├── lib/utils.ts      # cn(), formatCurrency(), formatDate(), sleep()
│       └── types.ts          # Frontend type definitions
│
└── prompts/
    └── frontend-build-prompt.md  # The prompt given to Google AI Studio to build the UI
```

---

## Key Technical Details

### AT API
- **Base URL:** `https://appointmenttrader.com/v1`
- **Auth:** `api_token` as query parameter (`?key=xxx`), NOT Bearer header
- **Write safety:** All write endpoints have `isWritingRequest` param (default `false` = dry run)
- **Prices:** Always in smallest currency unit (cents for USD)
- **Bids:** 5-minute reporting delay
- **Key expensive endpoint:** `marketdata/get_required_inventory_forecast` — $0.10/call

### Claude Agent SDK Integration
- **File:** `server/agent.ts`
- **Pattern:** Manual agentic loop (NOT using `@anthropic-ai/claude-agent-sdk` package — uses raw `@anthropic-ai/sdk`)
- **Model:** `claude-sonnet-4-20250514` (configurable via `ANTHROPIC_MODEL` env var)
- **Tools:** 14 AT API tools + 2 memory tools (`memory_recall`, `memory_learn`)
- **Max turns:** 10 per invocation
- **Token tracking:** Input/output tokens logged per session

### 3-Tier Memory System
Inspired by the Felix Playbook (OpenClaw/Nat Eliason). See `/Users/alexjohnson/Downloads/Felix-Playbook.pdf` for the source material.

| Tier | Table(s) | Purpose | Decay |
|------|----------|---------|-------|
| **1: Tacit Knowledge** | `agent_memory` | Learned patterns, market intuitions, pricing strategies | Hot (7d) → Warm (30d) → Cold |
| **2: Session Logs** | `agent_sessions` | Every agent invocation: prompt, tools, response, tokens, duration | No decay (append-only) |
| **3: Knowledge Graph** | `locations`, `location_facts`, `trades` | Entity facts with access tracking | Hot → Warm → Cold |

**Operational tables:** `listings`, `listing_price_history`, `imports`, `market_snapshots`, `account_ledger`
**QMD layer:** `memory_embeddings` (pgvector 1536-dim, for future semantic search)
**Views:** `active_memory`, `pnl_summary`, `location_intelligence`
**Decay function:** `update_decay_tiers()` — run via `POST /api/memory/decay`

**How memory flows into the agent:**
1. `buildMemoryContext()` queries all 3 tiers and builds a text block
2. Text block is appended to the system prompt before each agent invocation
3. Agent has `memory_recall` tool for on-demand location lookups
4. Agent has `memory_learn` tool to store new insights mid-session
5. All sessions auto-logged with tool calls, tokens, and outcomes

### Dry Run / Live Toggle
- Server env: `DRY_RUN=true` (default)
- UI TopBar badge: Amber "DRY RUN" / Green "LIVE"
- TopBar calls `POST /api/config/dry-run` to toggle server state
- All write routes check: `process.env.DRY_RUN === "false" && req.body.execute === true`
- AT API `isWritingRequest` defaults to `false` (dry run) in the client layer

### Mock Data Toggle
- `VITE_USE_MOCK=true` in `ui/.env` makes frontend use mock data (no server needed)
- Mock data includes realistic entries: Carbone, French Laundry, Nobu, Le Bernardin

---

## Environment Variables

```bash
# Required
AT_API_KEY=                    # AppointmentTrader API key
ANTHROPIC_API_KEY=             # For Claude Agent SDK

# Database (required for memory features)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/at_edge?sslmode=require

# Optional
ANTHROPIC_MODEL=claude-sonnet-4-20250514   # Override agent model
SERVER_PORT=3001
DRY_RUN=true                   # Default: true (safe)
AUTO_APPROVE_BELOW_USD=0
DEFAULT_PROFIT_BASIS_POINTS=10000

# Gmail (optional, for email import automation)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_IMPORT_LABEL=AT-Import

# UI (set in ui/.env)
VITE_USE_MOCK=true             # Use mock data instead of real API
VITE_API_URL=http://localhost:3001/api
```

---

## Commands

```bash
npm run dev          # Start server (3001) + UI (3000) concurrently
npm run server       # Server only (tsx watch, auto-reload)
npm run ui           # UI only (Vite dev server)
npm run build        # TypeScript compile check
npm run db:migrate   # Run migration manually (also runs on server startup)

# CLI (standalone, doesn't need server running)
npm run scout        # Market intelligence scan
npm run import       # Import a reservation
npm run portfolio    # Portfolio review
npm run price-check  # Price analysis for a location
```

---

## API Endpoints

### Agent-Powered (use Claude)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/marketdata/scout` | Full market scan with AI analysis |
| GET | `/api/marketdata/price-check?locationAlias=&dateTime=&inventoryTypeID=` | AI pricing recommendation |
| GET | `/api/portfolio/review` | AI portfolio analysis with reprice recommendations |
| POST | `/api/import/parse` | Parse reservation email → match location → pricing |
| POST | `/api/agent/chat` | Freeform agent conversation |

### Direct AT API Proxies
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/marketdata/highest-converting` | Top converting locations |
| GET | `/api/marketdata/bid-imbalance` | Bid-to-ask ratio rankings |
| GET | `/api/marketdata/underserved` | Underserved locations |
| GET | `/api/marketdata/most-viewed` | High views, low supply |
| GET | `/api/marketdata/toplist` | Composite top list |
| GET | `/api/location/search?q=` | Search AT locations |
| GET | `/api/location/:alias/inventory-types` | Inventory types for location |
| GET | `/api/location/:alias/metrics?start=&end=` | 90-day metrics |
| GET | `/api/location/:alias/comparable-trades?dateTime=&inventoryTypeID=` | Trade comps |
| POST | `/api/location/:alias/listing` | Create listing (respects DRY_RUN) |
| GET | `/api/portfolio/listings` | Portfolio with popularity scores |
| GET | `/api/listing/:id/competing` | Competing listings |
| POST | `/api/listing/:id/price` | Update listing price |
| POST | `/api/listing/:id/visibility` | Toggle visibility |
| POST | `/api/listing/:id/fill-bid` | Fill a bid |
| POST | `/api/listing/:id/archive` | Archive listing |
| GET | `/api/bid/list` | Available bids |
| GET | `/api/account/list` | Account balances |

### Memory System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/memory/tacit` | Tier 1: Active learned patterns |
| GET | `/api/memory/sessions?type=&limit=` | Tier 2: Session logs |
| GET | `/api/memory/location/:alias` | Tier 3: Location intelligence |
| GET | `/api/memory/locations` | All known locations |
| GET | `/api/memory/stats` | Memory system statistics |
| POST | `/api/memory/learn` | Manually add a fact |
| POST | `/api/memory/supersede` | Supersede a fact (never delete) |
| POST | `/api/memory/decay` | Run decay cycle |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + config status |
| GET | `/api/config` | UI config (dryRun, hasDatabase, gmailConfigured) |
| POST | `/api/config/dry-run` | Toggle dry run mode |

---

## Database Schema Summary

```sql
-- Tier 1: Tacit Knowledge
agent_memory          -- Learned patterns with confidence + decay (hot/warm/cold)

-- Tier 2: Session Logs
agent_sessions        -- Every agent invocation (type, prompt, tools, response, tokens, duration)

-- Tier 3: Knowledge Graph
locations             -- AT locations we've interacted with
location_facts        -- Atomic facts per location with access tracking + decay
trades                -- Every comparable trade pulled (deduped by at_trade_id)

-- Operational
listings              -- Our listings with full lifecycle (draft → active → sold/expired/archived)
listing_price_history -- Every price change with reason
imports               -- Parsed reservation emails + outcomes
market_snapshots      -- Periodic market state captures (scout reports, etc.)
account_ledger        -- P&L tracking (deposits, withdrawals, fees, revenue)

-- QMD Search
memory_embeddings     -- pgvector 1536-dim for semantic retrieval (future)

-- Views
active_memory         -- Hot + warm facts only
pnl_summary           -- Profit/loss per listing
location_intelligence -- Rollup: trade count, avg price, fact count per location

-- Functions
update_decay_tiers()  -- Moves facts hot → warm → cold based on last_accessed
```

---

## What Works / What Doesn't

### Working (Verified Live 03/09/2026)
- Server compiles clean (TypeScript strict)
- UI compiles and builds clean (Vite)
- All routes defined and wired
- Memory system fully integrated into agent loop
- Dry run safety on all write operations
- TopBar DRY_RUN toggle synced with server
- Connection status indicator in TopBar
- Database migration runs automatically on startup
- Graceful degradation: everything works without DATABASE_URL, just no memory
- **AT API live calls working** with production key
- **Neon database connected** — 8,850 trades, 35 locations, 38 snapshots
- **Data pipeline running** — collector pulls every 4 hours, stores to Neon
- **Chart data API** — `/api/chart-data/:alias` serves OHLC, volume, demand from Neon
- **Per-series data source badges** — LIVE DATA / PARTIAL DATA / SIMULATED on charts
- **Backfill complete** — 33 locations with 60 days of future comparable trade data

### Tested and Working AT API Endpoints
- toplist, bid/ask imbalance, underserved, most viewed
- comparable trades (future dates only)
- location metrics, inventory types, search
- account list

### Known Non-Working AT API Endpoints
- `get_metric_history`: "No available metrics" for this account
- `get_highest_converting_locations`: "No available metrics" for this account

### Phase 4 Blockers (See PLAN.md)
- **pageSize defaults are 50** — must be 25 (breaks all market data routes + agent tools)
- **VITE_USE_MOCK=true** — UI uses mock data instead of real API
- **MOCK_RESTAURANTS** hard-coded in DashboardShell.tsx
- **Mock transactions** in Account.tsx (real endpoint exists)
- **Hard-coded stats** in Dashboard.tsx
- **MOCK_ALERTS** in AlertsPanel.tsx (no alert system exists)
- Gmail OAuth not set up
- pgvector embedding pipeline not implemented
- Decay cycle manual only (`POST /api/memory/decay`)
- No Memory/Intelligence page in UI
- `src/agents/` standalone modules overlap with `server/routes/`

---

## Related Files Outside This Project

| File | Location | Purpose |
|------|----------|---------|
| Felix Playbook | `/Users/alexjohnson/Downloads/Felix-Playbook.pdf` | Source material for 3-tier memory architecture |
| Original frontend | `/Users/alexjohnson/Downloads/at-edge/` | Google AI Studio output (before rewiring) |
| Original project copy | `/Users/alexjohnson/Stiltner Landscapes & Co./projects/at-edge/` | Previous location (may be stale) |
| AVGJ Apps neighbor | `/Users/alexjohnson/AVGJ Apps/ReservationInsiderPro` | Related AT project |

---

## Quick Start for New Session

```bash
cd "/Users/alexjohnson/AVGJ Apps/at-edge"

# 1. Create .env from example
cp .env.example .env
# Fill in: AT_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL

# 2. Create Neon database
# Go to https://console.neon.tech → New Database → "at_edge"
# Copy connection string to DATABASE_URL in .env

# 3. Start everything
npm run dev
# Server starts on :3001, UI on :3000
# Migration runs automatically on startup

# 4. For mock data development (no API keys needed)
# Add VITE_USE_MOCK=true to ui/.env
cd ui && npm run dev
```

---

## Design Decisions & Rationale

1. **Manual agentic loop over Agent SDK package:** The `@anthropic-ai/claude-agent-sdk` wasn't used because the manual loop in `agent.ts` gives us full control over tool execution, memory injection, session logging, and token tracking. The raw `@anthropic-ai/sdk` is sufficient.

2. **Memory is optional (graceful degradation):** Every database call is wrapped in `if (hasDatabase())` checks. The server works identically without a database — you just don't get memory features. This makes development and testing easier.

3. **Never delete, always supersede:** Following the Felix Playbook pattern, facts are never deleted from `agent_memory` or `location_facts`. They get `status = 'superseded'` with a pointer to the replacement. This preserves audit trail.

4. **Decay is time-based with access reheating:** Facts go hot → warm → cold based on `last_accessed`. But accessing a cold fact reheats it to hot. This means frequently-useful facts resist decay naturally.

5. **Dry run by default everywhere:** The AT API, the server, and the UI all default to dry run. You have to explicitly opt into live execution at every layer. This prevents accidental listing creation.

6. **UI was built by Google AI Studio, then rewired:** The frontend was generated from a detailed prompt (`prompts/frontend-build-prompt.md`), then all API calls were redirected from Gemini to the Express server + Claude Agent SDK. Mock data was preserved for development.
