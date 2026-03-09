# AT Edge — Frontend UI Build Prompt

## What I Need

Build a complete, modern single-page frontend dashboard for "AT Edge" — an intelligent market-making tool for AppointmentTrader (a reservation trading marketplace). The app helps sellers identify opportunities, import reservations via email, manage their portfolio of listings, and make data-driven pricing decisions.

This is a **real tool I'll use daily** — not a demo. Prioritize usability, information density, and speed over visual flair.

## Tech Stack Requirements

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** for styling
- **shadcn/ui** component library (use the components, don't reinvent)
- **Recharts** for data visualization
- **React Router v7** for navigation
- **TanStack Query (React Query)** for data fetching/caching
- No backend needed — the UI calls a local API server. For now, use **mock data** that matches the types below, with a clean `api/` layer I can swap to real fetch calls later.

## Pages & Layout

### Global Layout
- Sidebar navigation (collapsible) with these sections: Dashboard, Scout, Import, Portfolio, Price Check, Account
- Top bar with: app name "AT Edge", connection status indicator (green/red dot), current mode badge ("DRY RUN" in amber or "LIVE" in green)
- Dark theme by default (trading terminal aesthetic — think Bloomberg, not Dribbble). Use zinc/slate grays, with green (#3C9A52) for positive/profit and red (#D9534F) for negative/loss. Accent: amber for warnings/dry-run indicators.

---

### 1. Dashboard (home page `/`)

The command center. At-a-glance view of everything that matters.

**Top row — 4 stat cards:**
- Account Balance (from `/v1/account/get_list`)
- Active Listings (count from portfolio)
- Open Bids (count from `/v1/bid/get_list`)
- Pending Imports (count of unprocessed emails)

**Middle row — 2 panels side by side:**
- **Market Pulse** (left, wider): A compact table showing top 10 opportunities from the most recent scout scan. Columns: Location, City, Signal Type (badge: "Underserved", "High Converting", "Bid Imbalance"), Score, Trend arrow (up/down/flat).
- **Recent Activity** (right): Timeline/feed of recent actions — listings created, prices changed, bids filled, emails processed. Each entry shows timestamp, action type icon, and a one-line description.

**Bottom row:**
- **Portfolio Performance**: A simple line chart showing total portfolio value over the last 30 days (mock this with realistic data). X-axis: dates, Y-axis: USD value.

---

### 2. Scout Page (`/scout`)

Market intelligence scanner.

**Controls bar:**
- "Run Scan" button (primary, green) — triggers a market scan
- Page size selector (25, 50, 100)
- Last scan timestamp

**Main content — Tabbed view with 5 tabs:**

Each tab shows a sortable, filterable data table:

1. **Highest Converting** — Columns: Rank, Location, City, Conversion Rate (%), Listings (30d), Trades (30d)
2. **Bid/Ask Imbalance** — Columns: Rank, Location, City, Bids, Listings, Ratio, Spread
3. **Underserved** — Columns: Rank, Location, City, Bids (30d), Listings (30d), Gap
4. **Most Viewed** — Columns: Rank, Location, City, Views, Listings, Views/Listing
5. **Top List** — Columns: Rank, Location, City, Score, composite data

**Below the tabs:**
- "AI Analysis" expandable section — shows the Claude-generated markdown intelligence report. Render the markdown properly (headings, bold, lists, etc.).

**Row click behavior:**
- Clicking a location row opens a slide-over panel showing detailed metrics for that location (mock the 90-day metrics data).

---

### 3. Import Page (`/import`)

The email-to-listing pipeline.

**Two modes (toggle at top):**

#### Gmail Mode (default)
- Shows a list of unprocessed emails from the `AT-Import` Gmail label
- Each email card shows: Subject, From, Date, and a status badge (Pending, Processing, Complete, Error)
- "Process All" button and individual "Process" buttons per email
- When processing, show a step-by-step progress indicator:
  1. ✓ Email parsed
  2. ✓ Location matched: `carbone-new-york`
  3. ✓ Comparable trades retrieved
  4. ✓ Price recommended: $65.00
  5. ○ Awaiting confirmation

#### Manual Mode
- Large textarea to paste a confirmation email
- "Parse & Import" button
- Shows the parsed result in a structured form (editable fields):
  - Restaurant Name (with AT location search/autocomplete below it)
  - Date picker
  - Time picker
  - Party Size
  - First Name, Last Name
  - Email, Phone
  - Confirmation Number

**After parsing (both modes), show:**
- **Pricing Panel**: Recommended price (large, prominent), price range slider (min-max), comparable trades summary (avg, median, count), reasoning text from Claude
- **Listing Preview**: What the listing will look like on AT
- **Action buttons**: "Create Listing (Dry Run)" (amber) and "Create Listing (Live)" (green, only enabled when DRY_RUN is off). Show dry-run validation result inline.

---

### 4. Portfolio Page (`/portfolio`)

Manage active listings.

**Summary bar:**
- Total listings count
- Total portfolio value (sum of all listing prices)
- Average popularity score
- Listings expiring within 48 hours (highlighted amber)

**Main table — sortable, filterable:**
Columns: Status (badge), Location, Date/Time, Party Size, Price, Popularity Score (with color-coded bracket: green=high, amber=mid, red=low), Competing Listings (count), Days Until, Actions (dropdown: Reprice, Toggle Visibility, Fill Bid, Archive)

**Row expansion (click to expand):**
- Competing listings mini-table: their prices, dates, status
- Comparable trades data
- Quick reprice form: current price, recommended price, new price input, "Update Price" button

**"AI Review" button (top right):**
- Triggers portfolio analysis
- Shows Claude's markdown report in a modal/drawer with sections: Reprice Recommendations, Bid Alerts, Underperformers, Expiring Soon
- Each recommendation has a one-click "Apply" button next to it

---

### 5. Price Check Page (`/price-check`)

Quick pricing lookup for any location.

**Input form:**
- Location search (autocomplete input that searches AT locations)
- Date picker
- Time picker
- Inventory Type dropdown (populated from `get_inventory_types` for selected location)
- "Check Price" button

**Results (3-column layout):**

Left column — **Comparable Trades:**
- Average price (large, prominent number)
- Median price
- Number of comps
- Price factor
- Is exact inventory type match (badge)
- Table of individual comparable trades

Center column — **Market Metrics (90-day):**
- Key metrics in a grid of stat cards
- Mini sparkline charts for trends if metric history is available

Right column — **Inventory Forecast:**
- Predicted demand for the selected date range
- YoY market price change (percentage with arrow)
- Recommended list price with profit target
- Source data locations used for the forecast

---

### 6. Account Page (`/account`)

**Account cards:**
- One card per account showing: Account Name, Balance (formatted as USD), Credit Limit, Available (balance + credit)
- Main account highlighted

**Transaction History:**
- Paginated table: Date, Type (badge), Description, Amount (+green / -red), Balance After
- Filter by date range and type

**User Details:**
- Read-only display of user alias, permissions, medals, etc.

---

## Data Types (TypeScript)

These are the exact types the backend uses. The mock data layer should generate data matching these shapes.

```typescript
// AT API Response Envelope
interface ATResponse<T = unknown> {
  RequestUserAlias: string;
  RequestPath: string;
  RequestStatus: "Succeeded" | "Failed";
  ResponseCode: number;
  ResponseMessage: string;
  Payload?: T;
}

// Pagination
interface PaginationParams {
  pageSize?: number;
  pageNumber?: number;
}

// Market Data
interface LocationRanking {
  locationAlias: string;
  locationName?: string;
  city?: string;
  score?: number;
  bidCount?: number;
  listingCount?: number;
  viewCount?: number;
  conversionRate?: number;
  [key: string]: unknown;
}

// Listings
interface Listing {
  listingID: string;
  locationAlias: string;
  locationName?: string;
  dateTime: string;
  priceAmountInSmallestUnit: number;
  inventoryTypeID: number;
  inventoryTypeName?: string;
  status?: string;
  popularityScoreBracket?: number;
  marketVisibility?: boolean;
  [key: string]: unknown;
}

interface CompetingListing {
  listingID: string;
  priceAmountInSmallestUnit: number;
  dateTime: string;
  [key: string]: unknown;
}

// Bids
interface Bid {
  bidID: number;
  locationAlias: string;
  locationName?: string;
  bidAmount: number;
  dateTimeRangeStart: string;
  dateTimeRangeEnd: string;
  inventoryTypeID: number;
  creatorUserAlias?: string;
  [key: string]: unknown;
}

// Account
interface Account {
  accountID: number;
  accountName?: string;
  accountNameAndBalance?: string;
  balance?: number;
  creditLimit?: number;
  currency?: string;
  [key: string]: unknown;
}

// Parsed email reservation
interface ParsedReservation {
  restaurantName: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  partySize: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  confirmationNumber?: string;
  specialNotes?: string;
}

// Import result
interface ImportResult {
  emailId: string;
  subject: string;
  parsed: ParsedReservation;
  locationMatch: { alias: string; name: string } | null;
  pricingAdvice: string;
  recommendedPriceCents: number;
  priceRangeMinCents: number;
  priceRangeMaxCents: number;
  listingResult: unknown;
  status: "created" | "dry_run" | "no_match" | "error";
  error?: string;
}

// Scout report
interface ScoutReport {
  report: string; // Markdown content from Claude
  rawData: {
    highestConverting: LocationRanking[];
    mostBidsLeastAsks: LocationRanking[];
    underserved: LocationRanking[];
    mostViewedLeastListings: LocationRanking[];
    toplist: LocationRanking[];
  };
  generatedAt: string;
}

// Portfolio review
interface PortfolioReview {
  report: string; // Markdown content from Claude
  listings: Listing[];
  generatedAt: string;
}
```

## Mock Data Guidelines

Generate realistic mock data:
- Use real restaurant names (Carbone NYC, The French Laundry, Nobu Malibu, Eleven Madison Park, etc.)
- Prices should be in cents (e.g., 7500 = $75.00) and realistic for high-end dining ($25-$250 range)
- Dates should be in the near future (next 1-30 days)
- Times should be typical dinner reservations (17:00-21:00) with some lunch (11:30-13:30)
- Party sizes: mostly 2-4, occasionally 6-8
- Popularity scores: 1-10 bracket
- Location aliases should be kebab-case (e.g., `carbone-new-york`, `nobu-malibu`)
- Include a mix of cities: New York, Los Angeles, San Francisco, London, Paris, Las Vegas

## API Layer Structure

Create an `api/` directory with:
- `client.ts` — base fetch wrapper (currently returns mock data, easy to swap to real endpoints later)
- `marketdata.ts`, `location.ts`, `listing.ts`, `portfolio.ts`, `bid.ts`, `account.ts` — one file per endpoint category
- Each function should return a `Promise<ATResponse<T>>` matching the envelope structure
- Add a 200-500ms artificial delay to mock calls to simulate real API latency

## Important UX Details

1. **All prices displayed as USD** — convert from cents everywhere: `(cents / 100).toFixed(2)` with `$` prefix
2. **Dates displayed in US format** — MM/DD/YYYY with 12-hour time (e.g., "03/15/2026 7:00 PM")
3. **Tables should be sortable** by clicking column headers (toggle asc/desc)
4. **Loading states** — use skeleton loaders, not spinners
5. **Toast notifications** for actions (listing created, price updated, etc.)
6. **Responsive** — should work on desktop (primary) and tablet. Mobile is not a priority.
7. **Keyboard shortcuts**: `S` for scout, `I` for import, `P` for portfolio (when no input is focused)
8. **Empty states** — friendly messages with CTAs when there's no data (e.g., "No listings yet. Import your first reservation →")

## File Structure

```
at-edge-ui/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   ├── api/
│   │   ├── client.ts
│   │   ├── mock-data.ts
│   │   ├── marketdata.ts
│   │   ├── location.ts
│   │   ├── listing.ts
│   │   ├── portfolio.ts
│   │   ├── bid.ts
│   │   └── account.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── AppLayout.tsx
│   │   ├── ui/ (shadcn components)
│   │   ├── dashboard/
│   │   ├── scout/
│   │   ├── import/
│   │   ├── portfolio/
│   │   ├── price-check/
│   │   └── account/
│   ├── hooks/
│   │   └── use-*.ts
│   ├── lib/
│   │   ├── utils.ts (formatCurrency, formatDate, etc.)
│   │   └── constants.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Scout.tsx
│   │   ├── Import.tsx
│   │   ├── Portfolio.tsx
│   │   ├── PriceCheck.tsx
│   │   └── Account.tsx
│   └── types/
│       └── index.ts
```

## What Success Looks Like

When I open this app, I should immediately feel like I have an unfair advantage in the AppointmentTrader marketplace. The dashboard should feel like a trading terminal — dense with actionable information, fast to navigate, and every click should get me closer to either identifying an opportunity or executing on one.

Build the complete, working application. Every page, every component, every mock data file. I want to `npm run dev` and see a fully functional UI.
