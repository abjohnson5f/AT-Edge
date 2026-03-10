# AT Edge — Handoff Document

**Last Updated:** 03/10/2026
**Location:** `/Users/alexjohnson/AVGJ Apps/at-edge/`
**GitHub:** https://github.com/abjohnson5f/AT-Edge (private)
**Status:** Phase 4 complete (production-ready). Trading terminal live with Apify + Claude enrichment.

**Build Plan:** See `PLAN.md` for phase details and roadmap.
**Memory:** See `.claude/projects/-Users-alexjohnson-AVGJ-Apps-at-edge/memory/` for AT API patterns and session context.
**Skill:** `/at-edge-dev` loads full project context for new sessions.

---

## What Is This

AT Edge is an intelligent market-making application for [AppointmentTrader](https://appointmenttrader.com) (a reservation trading marketplace). It combines the AT REST API with the Claude Agent SDK to create a competitive advantage tool for identifying opportunities, importing reservations, managing portfolio, and making data-driven pricing decisions.

**The user has explicitly stated:** "I have absolutely zero intention to operate outside of the TOS for AppointmentTrader." This is a legitimate programmatic approach to the platform.

---

## Architecture

```
┌──────────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│  React Frontend  │────▶│  Express API Server     │────▶│  AT API          │
│  (Vite, port 4000)│    │  (port 3001)            │     │  appointmenttrader.com/v1
│                  │     │                         │     └─────────────────┘
│  TanStack Query  │     │  Claude Agent SDK       │
│  shadcn/ui       │     │  (agentic loop w/ tools)│────▶┌─────────────────┐
│  Tailwind CSS    │     │                         │     │  Neon Postgres   │
│  Recharts        │     │  3-Tier Memory System   │     │  (pgvector)      │
│  TradingView     │     │                         │     └─────────────────┘
│  lightweight-    │     │  Apify REST API         │────▶┌─────────────────┐
│  charts          │     │  (restaurant enrichment)│     │  Apify Cloud     │
└──────────────────┘     └─────────────────────────┘     │  (rag-web-browser)│
                                                         └─────────────────┘
```

**Four-tier system:**
1. **UI** (`ui/`) — React SPA with trading terminal aesthetic (dark theme, zinc palette)
2. **Server** (`server/`) — Express API that proxies AT API calls, adds Claude intelligence, orchestrates Apify enrichment
3. **AT API Client** (`src/api/`) — TypeScript client wrapping all ~65 AT API endpoints
4. **Restaurant Enrichment** — Apify scrapes web data, Claude generates trading analysis, Neon caches results

---

## File Structure

```
at-edge/
├── .env                      # Env vars (AT_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL, APIFY_API_TOKEN)
├── package.json              # Root: server deps + scripts
├── tsconfig.json             # ES2022, NodeNext, strict
│
├── src/                      # AT API Client Layer
│   ├── config.ts             # Environment config
│   ├── index.ts              # CLI entry point
│   └── api/
│       ├── client.ts         # Core ATClient class (auth via api_token query param)
│       ├── types.ts          # Full TypeScript types
│       ├── index.ts          # ATAPI facade
│       └── endpoints/        # marketdata, location, listing, portfolio, bid, account
│
├── server/                   # Express API Server
│   ├── index.ts              # Server entry: CORS, routes, DB init, health/config, Apify status
│   ├── agent.ts              # ★ Claude agentic loop + 14 AT tools + 2 memory tools
│   ├── collector.ts          # Data pipeline: AT API → Neon (runs every 4 hours)
│   ├── backfill.ts           # One-time seed script (already ran: 8,850 trades)
│   ├── db/
│   │   ├── migration.sql     # 13 tables, 3 views, decay function, restaurant_profiles cache
│   │   ├── client.ts         # Neon connection pool, query helpers
│   │   ├── memory.ts         # 3-tier memory read/write API
│   │   └── index.ts          # Barrel export
│   └── routes/
│       ├── marketdata.ts     # Scout (agent), price-check (agent), + 5 direct AT proxies
│       ├── location.ts       # Search, inventory types, metrics, comps, listing creation
│       ├── listing.ts        # Price updates, visibility, bid filling, archiving
│       ├── portfolio.ts      # Portfolio listing + agent-powered review
│       ├── bid.ts            # Bid listing
│       ├── account.ts        # Account balances, details, transactions
│       ├── import.ts         # Email parsing via Claude agent
│       ├── agent.ts          # Freeform agent chat endpoint
│       ├── memory.ts         # Memory management API (8 endpoints)
│       ├── chartdata.ts      # OHLC, volume, demand from Neon (for TradingView charts)
│       └── restaurant.ts     # ★ NEW: Apify + Claude restaurant enrichment with Neon caching
│
├── ui/                       # React Frontend
│   ├── package.json          # at-edge-ui
│   ├── vite.config.ts        # @alias, Tailwind v4, HMR
│   ├── .env                  # VITE_USE_MOCK=false, VITE_API_URL
│   └── src/
│       ├── main.tsx          # React entry: renders App (React Router)
│       ├── App.tsx           # Routes: / = DashboardShell, /scout, /import, /portfolio, etc.
│       ├── api/
│       │   ├── client.ts     # apiGet/apiPost → http://localhost:3001/api (NO mock fallback)
│       │   ├── marketdata.ts # getScoutReport, getPriceCheck (live only)
│       │   ├── listing.ts    # getListings, updateListingPrice, toggleVisibility, archive
│       │   ├── portfolio.ts  # getPortfolioReview
│       │   ├── account.ts    # getAccounts
│       │   ├── bid.ts        # getBids
│       │   └── location.ts   # searchLocations, getInventoryTypes
│       ├── pages/
│       │   ├── Dashboard.tsx # Overview page (uses real API data, no Math.random())
│       │   ├── Scout.tsx     # 5-tab market data + Claude AI Analysis
│       │   ├── Import.tsx    # Forward-and-forget email → agent parsing → pricing
│       │   ├── Portfolio.tsx # Listing table with dropdown actions, AI Review modal
│       │   ├── PriceCheck.tsx# Location/date/time → 3-column results
│       │   └── Account.tsx   # Account cards + real transaction history from API
│       ├── components/
│       │   ├── layout/       # AppLayout, Sidebar (React Router pages), TopBar
│       │   ├── ui/           # shadcn components
│       │   └── trading/      # ★ Trading terminal components (11 files)
│       │       ├── DashboardShell.tsx   # Main grid: chart, watchlist, detail, alerts
│       │       ├── Sidebar.tsx          # Wired to React Router (useNavigate/useLocation)
│       │       ├── Header.tsx           # Search bar, connection status
│       │       ├── RestaurantInfoBar.tsx# Ticker bar
│       │       ├── PriceChart.tsx       # TradingView lightweight-charts (SIMULATED fallback intentional)
│       │       ├── RestaurantTabs.tsx   # Indicators, chart tools
│       │       ├── WatchlistPanel.tsx   # Personal watchlist with add/remove/search
│       │       ├── RestaurantDetailCard.tsx # Selected restaurant info card
│       │       ├── RestaurantProfileModal.tsx # ★ Apify + Claude enriched modal (4 tabs)
│       │       ├── AlertsPanel.tsx      # "Coming Soon" placeholder
│       │       └── ActionModal.tsx      # Fill Bid / Create Listing modals
│       ├── styles/
│       │   ├── base.css      # CSS reset + variables
│       │   └── dashboard.css # Trading terminal grid + all component styles
│       └── lib/utils.ts      # cn(), formatCurrency(), formatDate(), sleep()
│
├── ui/reference/             # MoonBucks Financial Dashboard (design reference from Perplexity)
│
└── PLAN.md                   # Full build plan with all phase details
```

---

## Key Technical Details

### AT API
- **Base URL:** `https://appointmenttrader.com/v1`
- **Auth:** `api_token` as query parameter (`?key=xxx`), NOT Bearer header
- **Write safety:** `isWritingRequest` param (default `false` = dry run)
- **Prices:** Always in cents (smallest currency unit)
- **pageSize:** MAX 25 (account permission `MaximumMarketDataResults`)
- **Comparable trades:** Future dates ONLY (past dates return 403)
- **Bids:** 5-minute reporting delay
- **Non-working endpoints:** `get_metric_history`, `get_highest_converting_locations` — "No available metrics"

### Claude Agent SDK Integration
- **File:** `server/agent.ts`
- **Pattern:** Manual agentic loop using raw `@anthropic-ai/sdk` (NOT `@anthropic-ai/claude-agent-sdk`)
- **Model:** `claude-sonnet-4-20250514` (configurable via `ANTHROPIC_MODEL`)
- **Tools:** 14 AT API tools + 2 memory tools (`memory_recall`, `memory_learn`)
- **Max turns:** 10 per invocation
- **Token tracking:** Input/output tokens logged per session

### Restaurant Profile Enrichment
- **File:** `server/routes/restaurant.ts`
- **Endpoint:** `GET /api/restaurant/:alias/profile`
- **Flow:** Check Neon cache (7-day TTL) → Apify `rag-web-browser` (Google search) → Claude AI analysis → cache result
- **Claude prompt:** Returns markdown analysis + `STRUCTURED_DATA:` JSON block with rating, priceLevel, cuisineType, highlights
- **Without Apify:** Works with Claude-only (estimates from knowledge + AT trading data)
- **With Apify:** Adds Google ratings, review counts, cuisine, phone, address
- **Cache table:** `restaurant_profiles` in Neon

### 3-Tier Memory System
| Tier | Table(s) | Purpose | Decay |
|------|----------|---------|-------|
| **1: Tacit Knowledge** | `agent_memory` | Learned patterns, market intuitions | Hot (7d) → Warm (30d) → Cold |
| **2: Session Logs** | `agent_sessions` | Every agent invocation with tokens/timing | Append-only |
| **3: Knowledge Graph** | `locations`, `location_facts`, `trades` | Entity facts with access tracking | Hot → Warm → Cold |

### Dry Run / Live Toggle
- Server env: `DRY_RUN=true` (default)
- UI TopBar badge: Amber "DRY RUN" / Green "LIVE"
- Toggle via `POST /api/config/dry-run`
- All write routes check: `process.env.DRY_RUN === "false" && req.body.execute === true`

### Watchlist
- **Backed by:** `localStorage` key `at-edge-watchlist`
- **Seeded:** Top 5 restaurants by trade count on first load
- **Features:** Add picker with search, X remove button, click-outside-close
- **City extraction:** Smart lookup from restaurant name/alias against known city database

---

## Environment Variables

```bash
# Required
AT_API_KEY=                    # AppointmentTrader API key
ANTHROPIC_API_KEY=             # For Claude Agent SDK

# Database (required for memory + chart data + enrichment cache)
DATABASE_URL=postgresql://...

# Optional
APIFY_API_TOKEN=               # Enables web scraping for restaurant profiles
ANTHROPIC_MODEL=claude-sonnet-4-20250514
SERVER_PORT=3001
DRY_RUN=true
AUTO_APPROVE_BELOW_USD=0
DEFAULT_PROFIT_BASIS_POINTS=10000

# Gmail (optional)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_IMPORT_LABEL=AT-Import

# UI (set in ui/.env)
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:3001/api
```

---

## Commands

```bash
npm run dev          # Start server (3001) + UI (4000) concurrently
npm run server       # Server only (tsx watch, auto-reload)
npm run ui           # UI only (Vite dev server)
npm run build        # TypeScript compile check
npm run db:migrate   # Run migration manually (also runs on server startup)
```

---

## API Endpoints

### Agent-Powered (use Claude)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/marketdata/scout` | Full market scan with AI analysis |
| GET | `/api/marketdata/price-check?locationAlias=&dateTime=&inventoryTypeID=` | AI pricing recommendation |
| GET | `/api/portfolio/review` | AI portfolio analysis |
| POST | `/api/import/parse` | Parse reservation email → match → pricing |
| POST | `/api/agent/chat` | Freeform agent conversation |
| GET | `/api/restaurant/:alias/profile` | ★ Apify + Claude restaurant enrichment |

### Direct AT API Proxies
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/marketdata/highest-converting` | Top converting locations |
| GET | `/api/marketdata/bid-imbalance` | Bid-to-ask ratio rankings |
| GET | `/api/marketdata/underserved` | Underserved locations |
| GET | `/api/marketdata/most-viewed` | High views, low supply |
| GET | `/api/marketdata/toplist` | Composite top list |
| GET | `/api/location/search?q=` | Search AT locations |
| GET | `/api/location/:alias/inventory-types` | Inventory types |
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

### Chart Data (from Neon)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chart-data/` | All locations with trade counts |
| GET | `/api/chart-data/:alias?tf=1D` | OHLC candles for TradingView |

### Memory System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/memory/tacit` | Active learned patterns |
| GET | `/api/memory/sessions?type=&limit=` | Session logs |
| GET | `/api/memory/location/:alias` | Location intelligence |
| GET | `/api/memory/locations` | All known locations |
| GET | `/api/memory/stats` | Memory system statistics |
| POST | `/api/memory/learn` | Add a fact |
| POST | `/api/memory/supersede` | Supersede a fact |
| POST | `/api/memory/decay` | Run decay cycle |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + config status |
| GET | `/api/config` | UI config (dryRun, hasDatabase, gmailConfigured) |
| POST | `/api/config/dry-run` | Toggle dry run mode |

---

## Database Schema (13 tables + 3 views)

```sql
-- Tier 1: Tacit Knowledge
agent_memory              -- Learned patterns (category, fact, confidence, decay_tier)

-- Tier 2: Session Logs
agent_sessions            -- Every agent invocation (type, prompt, tools, response, tokens)

-- Tier 3: Knowledge Graph
locations                 -- 35 AT locations (alias, name, city, cuisine_type)
location_facts            -- Atomic facts per location with decay
trades                    -- 8,850+ comparable trades (deduped by at_trade_id)

-- Operational
listings                  -- Listing lifecycle (draft → active → sold/expired/archived)
listing_price_history     -- Every price change with reason
imports                   -- Parsed reservation emails
market_snapshots          -- Periodic market state captures
account_ledger            -- P&L tracking

-- Restaurant Enrichment Cache
restaurant_profiles       -- Apify + Claude data with 7-day TTL (rating, cuisine, highlights, ai_analysis)

-- QMD Search
memory_embeddings         -- pgvector 1536-dim (future)

-- Views: active_memory, pnl_summary, daily_ohlc, location_intelligence
```

---

## What Works (Verified 03/10/2026)

- ✅ Server + UI compile clean (TypeScript strict)
- ✅ All routes defined and wired
- ✅ React Router: Dashboard, Scout, Import, Portfolio, Price Check, Account all navigable
- ✅ Trading terminal: DashboardShell with chart, watchlist, detail card, alerts, profile modal
- ✅ Live data from Neon (chart-data, memory/locations) replaces all mock data
- ✅ `VITE_USE_MOCK=false` — mock-data.ts deleted, all mock branches removed
- ✅ pageSize = 25 everywhere (was 50/100, caused 400 errors)
- ✅ Restaurant profile enrichment: Apify + Claude → Neon cache
- ✅ Claude AI Analysis tab with structured data (rating, priceLevel, cuisineType, highlights)
- ✅ City extraction for 34/35 locations (smart alias/name matching)
- ✅ Dates: MM/DD/YYYY in user's local timezone
- ✅ 4-hour collection cycle running (collector.ts)
- ✅ Memory system integrated into agent loop
- ✅ Dry run safety on all write operations
- ✅ Pushed to GitHub: `abjohnson5f/AT-Edge`

## What's Next (Phase 5+)

- **Apify token** — Add `APIFY_API_TOKEN` to `.env` for web-enriched restaurant profiles
- **Gmail OAuth** — Set up GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN for email import automation
- **Memory/Intelligence page** — New UI page showing the 3-tier memory system
- **pgvector embeddings** — Semantic search across all tiers
- **Automated decay** — Cron job for `POST /api/memory/decay` instead of manual
- **Alert system** — Replace "Coming Soon" AlertsPanel with real bid imbalance / price threshold alerts
- **Din Tai Fung city** — Only location without auto-detected city (alias has no city slug)
- **PriceChart SIMULATED badges** — Mock generators are intentional fallbacks; need more historical data to go fully LIVE
- **Search bar** — Currently only filters watchlist; could expand to global restaurant search

---

## User Preferences

- Date format: MM/DD/YYYY
- All times in user's local timezone
- "Location" → "Restaurant" in all UI labels
- Always verify visual changes with Puppeteer screenshots before declaring done
- Currency: USD with $1,234.56 formatting

---

## Design Decisions & Rationale

1. **Manual agentic loop over Agent SDK package** — Full control over tool execution, memory injection, session logging, token tracking
2. **Memory is optional** — Every DB call wrapped in `if (hasDatabase())`. Works identically without DB.
3. **Never delete, always supersede** — Felix Playbook pattern for facts and memory
4. **Decay is time-based with access reheating** — Frequently-used facts resist decay
5. **Dry run by default everywhere** — AT API, server, and UI all default to safe mode
6. **PriceChart mock generators are intentional** — SIMULATED badges show when no real OHLC data exists. Never delete these fallbacks.
7. **Restaurant enrichment degrades gracefully** — Without Apify: Claude-only analysis. Without Claude: empty profile. Without DB: no caching.
8. **City extraction from alias/name** — Uses known-city database matching instead of naive last-word parsing

---

## Quick Start for New Session

```bash
cd "/Users/alexjohnson/AVGJ Apps/at-edge"
npm run dev    # Starts server (:3001) + UI (:4000)
```

Or use the skill: `/at-edge-dev`
