# AT Edge

A trading-terminal style web app for pricing and managing restaurant reservation listings on AppointmentTrader. It shows where demand is running ahead of supply, recommends a price for each reservation you want to sell, and tracks your listings. A Claude agent does the analysis, and live writes to the marketplace are off by default.

## Why I Built It

AppointmentTrader is a marketplace where people buy and sell restaurant reservations. Pricing one by hand means checking comparable trades, bid depth, and demand across many restaurants. I built AT Edge for my own use as a seller, to put that research on one screen and to treat each restaurant like a ticker: where is demand ahead of supply, and what do comparable trades say a listing is worth.

## How It Works

The React UI talks to an Express server. The server calls the AppointmentTrader REST API, runs a Claude agent over that API's read endpoints, and keeps its own history in Neon Postgres.

- **UI** (`ui/`). React 19, Vite, Tailwind, shadcn/ui, TanStack Query, and TradingView lightweight-charts. Pages for the dashboard (price chart, watchlist, restaurant detail), Scout, Import, Portfolio, Price Check, and Account.
- **Marketplace client** (`src/api/`). A typed TypeScript wrapper around the AppointmentTrader REST API. It handles the API's quirks: prices in cents, a page size cap of 25, and nested responses with string values.
- **Agent** (`server/agent.ts`). A hand-written tool-use loop on the Anthropic SDK (`@anthropic-ai/sdk`), capped at 10 turns per request. It has 14 tools, none of which write to the marketplace (13 market reads and one email-parsing helper), plus 2 memory tools. It powers the market scout, price checks, portfolio review, reservation email parsing, and a freeform chat endpoint.
- **Data collector** (`server/collector.ts`). Every 4 hours it pulls comparable trades and market rankings into Postgres so the charts have history.
- **Memory** (`server/db/`). Three tiers in Postgres: learned patterns, a log of every agent session with tool calls and token counts, and a knowledge base of restaurants, facts, and trades. Memory is added to the agent's system prompt before each run. Facts are superseded, never deleted, and age from hot to warm to cold unless they are used again. The design is inspired by the Felix Playbook (Nat Eliason), as noted in `HANDOFF.md`.
- **Email import** (`server/email-scanner.ts`). Watches a Gmail inbox over IMAP, has Claude pick out reservation confirmations, parses them, and suggests a price. Results go to a review queue in the UI. The scanner never creates a listing.
- **Portfolio monitor** (`server/portfolio-monitor.ts`). Polls your listings every 15 minutes and sends a Telegram message when one sells, is approved, expires, gains attention, or nears its deadline.
- **Restaurant profiles** (`server/routes/restaurant.ts`). An Apify web search plus Claude analysis, cached in Postgres for 7 days. It still works without Apify, using Claude only.
- **Sign-in** (`server/auth.ts`). Optional Google OAuth with an email allowlist.
- **Deploy**. A `Dockerfile` and `railway.json` run the server and the built UI as one service.

## Safety and Guardrails

- **Dry run is the default.** `DRY_RUN` is treated as true unless it is set to the exact string `false`.
- **Two keys for every write.** The five server routes that can change the marketplace (create listing, set price, set visibility, fill bid, archive) compute `execute` as `DRY_RUN === "false"` and `req.body.execute === true`. If either is missing, the request goes to the marketplace with `isWritingRequest` set to false, which validates the request without changing anything.
- **The client defaults to dry run too.** The `write()` helper in `src/api/client.ts` sends `isWritingRequest: false` unless the caller passes `execute`.
- **The agent cannot write.** None of its 14 tools creates, reprices, hides, or archives a listing.
- **The CLI is dry run unless you pass `--execute`.**
- **Bounded runs.** The agent loop stops after 10 turns, and token counts are logged per session.
- **Platform terms.** The app uses the marketplace's REST API with my account's key. The project rule is to stay within the marketplace's terms of service.

Limits worth knowing. The header badge in the UI switches the server between dry run and live at runtime (`POST /api/config/dry-run`), and live writes still need `execute: true` on each request. When the Google sign-in variables are not set, authentication is off and every route is open, so run it on your own machine or set up sign-in before you deploy.

## Run It Locally

You need Node.js 20, an AppointmentTrader API key, and an Anthropic API key. Postgres is optional, but without `DATABASE_URL` the memory, charts, collector, and profile cache are switched off.

```bash
git clone https://github.com/abjohnson5f/AT-Edge.git
cd AT-Edge
npm install
npm --prefix ui install
cp .env.example .env     # then fill in your own values
npm run dev              # API on :3001, UI on :4000
```

Open http://localhost:4000. The Vite dev server proxies `/api` to port 3001, and the database migration runs on server start when `DATABASE_URL` is set.

Environment variables are listed by name only. Set them in `.env`.

| Variable | Needed for |
|---|---|
| `AT_API_KEY` | Required. Marketplace access. |
| `ANTHROPIC_API_KEY` | Required. The agent and all Claude analysis. |
| `DATABASE_URL` | Recommended. Neon Postgres connection string. |
| `DRY_RUN` | Defaults to true. Set to `false` only to allow live writes. |
| `APIFY_API_TOKEN` | Optional. Web data for restaurant profiles. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Optional. Email import over IMAP. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional. Portfolio alerts. |
| `ANTHROPIC_MODEL` | Optional. Overrides the default Sonnet model. |
| `AUTO_APPROVE_BELOW_USD`, `DEFAULT_PROFIT_BASIS_POINTS` | Optional. Pricing settings. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `BASE_URL` | Optional. Google sign-in for a hosted deploy. |
| `PORT` or `SERVER_PORT` | Optional. Server port, default 3001. |

These command line tools are all dry run unless you add `--execute`.

```bash
npm run scout
npm run price-check <locationAlias> "<YYYY-MM-DD HH:MM:SS>" [inventoryTypeID]
npm run portfolio
npm run import -- --manual
npm run build:check      # type-check the server
```

## Status

- Working, single-user software. Version 0.2.2, last commit 04/13/2026, about 13,000 lines of TypeScript across the server, command line tools, and UI.
- No automated tests yet. The only checks are TypeScript type checks (`npm run build:check` for the server, `npm run lint` inside `ui/`).
- The alerts panel in the UI is a placeholder. Alerts go out through Telegram from the server instead.
- Price charts show a series labeled SIMULATED when there is not enough collected history, and the dashboard falls back to a sample watchlist if the API calls fail.
- Memory aging runs when `POST /api/memory/decay` is called. It is not scheduled. The embeddings table exists in the schema, but semantic search is not built.
- Built for one seller account, not for multiple tenants. There is no license file yet.
