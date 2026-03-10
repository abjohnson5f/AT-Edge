# AT Edge — Project Instructions

> Intelligent market-making app for AppointmentTrader (reservation trading).
> Combines AT REST API + Claude Agent SDK + Neon Postgres + Apify enrichment.

**GitHub:** https://github.com/abjohnson5f/AT-Edge (private)
**Handoff:** See `HANDOFF.md` for comprehensive project state and architecture.
**Build Plan:** See `PLAN.md` for phase details and roadmap.

---

## Commands

```bash
npm run dev          # Server (:3001) + UI (:4000) concurrently
npm run server       # Server only (tsx watch)
npm run ui           # UI only (Vite)
npm run build        # TypeScript compile check
npm run db:migrate   # Run migration (also runs on server startup)
```

---

## Critical Rules

### AT API Constraints (non-negotiable)
- **Max pageSize: 25** — Account perm `MaximumMarketDataResults`. Requesting more = 400 error.
- **Auth: query param** — `?key=xxx`, NOT Bearer header
- **Prices: cents** — All `priceAmountInSmallestUnit` fields. Divide by 100 for display.
- **Comparable trades: future dates only** — Past dates return 403.
- **Response format:** Nested `Payload.ResponseBody.KeyValueList[]` with STRING values. Must parseInt/parseFloat.
- **Non-working endpoints:** `get_metric_history`, `get_highest_converting_locations` — "No available metrics"
- **`get_metrics` WORKS** — LowPrice, HighPrice, AveragePrice, TransactionCount, ActiveBids, PageVisitors

### Safety
- **DRY_RUN=true by default** at every layer (AT API, server, UI). Never change this without explicit user request.
- All write routes check: `process.env.DRY_RUN === "false" && req.body.execute === true`
- AT API `isWritingRequest` defaults to `false` in the client layer
- **Never delete facts** — always supersede (Felix Playbook pattern)

### Code Conventions
- TypeScript strict mode
- PriceChart mock generators are **INTENTIONAL** fallbacks with SIMULATED badges — never delete them
- `rao-s-new-york` is NOT a valid AT alias
- Collector has early-bail on Unknown Alias errors

### User Preferences
- Date format: MM/DD/YYYY
- All times in user's local timezone
- "Restaurant" not "Location" in UI labels
- Currency: USD with $1,234.56 formatting
- Verify visual changes with Puppeteer screenshots when possible
- TOS-compliant: "I have absolutely zero intention to operate outside of the TOS for AppointmentTrader."

---

## Architecture (quick reference)

```
React (Vite :4000) → Express (:3001) → AT API (appointmenttrader.com/v1)
                                      → Claude Agent SDK (agentic loop in server/agent.ts)
                                      → Neon Postgres (pgvector) — 13 tables, 3 views
                                      → Apify Cloud (rag-web-browser for restaurant enrichment)
```

### Key Files
| File | What it does |
|------|-------------|
| `server/agent.ts` | Claude agentic loop: 14 AT tools + 2 memory tools |
| `server/collector.ts` | Data pipeline: AT API → Neon (runs every 4 hours) |
| `server/routes/restaurant.ts` | Apify + Claude restaurant enrichment with Neon cache |
| `server/routes/chartdata.ts` | OHLC, volume, demand from Neon for TradingView |
| `server/db/migration.sql` | Full schema: 13 tables, 3 views, decay function |
| `ui/src/components/trading/DashboardShell.tsx` | Main trading terminal grid |
| `ui/src/components/trading/PriceChart.tsx` | TradingView charts (keep mock generators!) |
| `ui/src/components/trading/RestaurantProfileModal.tsx` | Apify + Claude enriched 4-tab modal |

### Environment
| Var | Required | Notes |
|-----|----------|-------|
| `AT_API_KEY` | Yes | AppointmentTrader production key |
| `ANTHROPIC_API_KEY` | Yes | Claude Agent SDK |
| `DATABASE_URL` | Yes* | Neon Postgres (*graceful degradation without it) |
| `APIFY_API_TOKEN` | No | Enables web scraping for restaurant profiles |
| `VITE_USE_MOCK` | — | Set to `false` in ui/.env |

---

## Memory & Context

- **Auto-memory:** `.claude/projects/-Users-alexjohnson-AVGJ-Apps-at-edge/memory/`
- **Skill:** `/at-edge-dev` loads full project context
- **Neon project:** `plain-term-05120283`, branch `br-shy-frog-adn3v1xy`
- **DB data:** 8,850+ trades, 35 locations, 38 snapshots (collected 03/09/2026)
