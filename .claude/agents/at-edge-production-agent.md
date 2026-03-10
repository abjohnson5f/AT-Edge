# AT Edge Production Readiness Agent

Use this prompt when spawning a subagent to work on AT Edge production readiness tasks.

## Agent Prompt Template

```
You are working on the AT Edge project at "/Users/alexjohnson/AVGJ Apps/at-edge".

BEFORE doing any work, read these files in order:
1. PLAN.md (root) — Current build plan, Phase 4 details
2. CLAUDE.md (root) — Full architecture reference

KEY CONSTRAINTS:
- AT API max pageSize is 25 (not 50, not 100)
- AT API responses are nested: Payload.ResponseBody.KeyValueList[]
- All prices are in cents (divide by 100 for display)
- Comparable trades require FUTURE dates only
- DRY_RUN=true is default — respect it

CURRENT TASK: [describe specific Phase 4 item here]

After completing changes:
- Run `npx tsc --noEmit` in project root to verify server compiles
- Run `cd ui && npx tsc --noEmit` to verify UI compiles
- Do NOT commit unless asked
```

## Recommended Subagent Splits

For maximum parallelism, these tasks are independent and can run simultaneously:

### Agent A: Server-side pageSize fix
```
Fix all pageSize defaults from 50 to 25 in:
- server/routes/marketdata.ts (lines 28, 68, 80, 92, 104, 116)
- server/agent.ts (tool descriptions + execution defaults)
- server/routes/bid.ts (line 12)
Verify with: npx tsc --noEmit
```

### Agent B: DashboardShell live data
```
Replace MOCK_RESTAURANTS in ui/src/components/trading/DashboardShell.tsx with:
1. Fetch from GET /api/chart-data/ (location list + trade counts)
2. Fetch from GET /api/memory/locations (names, cities)
3. Build Restaurant[] from real data
4. Fall back to static list if APIs unavailable
5. Generate color deterministically from alias hash
6. Set changePct to 0 until multi-day OHLC exists
Verify with: cd ui && npx tsc --noEmit
```

### Agent C: Dashboard + Account live data
```
Wire real data into:
1. ui/src/pages/Account.tsx — Replace mockTransactions with TanStack Query to /api/account/transactions
2. ui/src/pages/Dashboard.tsx — Replace hard-coded pendingImports, performanceData, recentActivity with API calls or sensible defaults
Verify with: cd ui && npx tsc --noEmit
```

### Agent D: Mock cleanup (run AFTER A, B, C)
```
1. Set VITE_USE_MOCK=false in ui/.env
2. Replace AlertsPanel MOCK_ALERTS with "Coming Soon" placeholder
3. Delete ui/src/api/mock-data.ts
4. Remove mockApiCall from ui/src/api/client.ts
5. Remove USE_MOCK branches from ui/src/api/marketdata.ts, listing.ts, portfolio.ts, account.ts, bid.ts, location.ts
6. Keep PriceChart mock generators (they're intentional fallbacks with SIMULATED badge)
Verify both: npx tsc --noEmit && cd ui && npx tsc --noEmit
```
