import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { marketdataRoutes } from "./routes/marketdata.js";
import { locationRoutes } from "./routes/location.js";
import { listingRoutes } from "./routes/listing.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { bidRoutes } from "./routes/bid.js";
import { accountRoutes } from "./routes/account.js";
import { importRoutes } from "./routes/import.js";
import { agentRoutes } from "./routes/agent.js";
import { memoryRoutes } from "./routes/memory.js";
import { chartdataRoutes } from "./routes/chartdata.js";
import { restaurantRoutes } from "./routes/restaurant.js";
import { uploadRoutes } from "./routes/upload.js";
import { hasDatabase, runMigration } from "./db/index.js";
import { runCollection } from "./collector.js";
import { setupAuth, requireAuth, isAuthEnabled } from "./auth.js";
import { startEmailScanner, stopEmailScanner } from "./email-scanner.js";
import { startPortfolioMonitor, stopPortfolioMonitor } from "./portfolio-monitor.js";
import { isNotifierConfigured } from "./notifier.js";
import { isImapConfigured } from "../src/email/gmail.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? process.env.SERVER_PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

// CORS: Allow dev ports + production domain
app.use(cors({
  origin: isProduction
    ? [process.env.BASE_URL || "https://www.reserveiq.io"]
    : [
        "http://localhost:3000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4000",
      ],
  credentials: true,
}));
app.use(express.json({ limit: "12mb" })); // base64 images can be ~8MB encoded

// Google OAuth sign-in (no-op if env vars not set)
setupAuth(app);

// Screenshot image serving — public (AT platform fetches images to display in listings)
app.use("/api/upload", uploadRoutes);

app.use(requireAuth);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    dryRun: process.env.DRY_RUN !== "false",
    hasAtKey: !!process.env.AT_API_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasDatabase: hasDatabase(),
  });
});

// Config endpoint — tells the UI about server state
app.get("/api/config", (_req, res) => {
  res.json({
    dryRun: process.env.DRY_RUN !== "false",
    hasDatabase: hasDatabase(),
    gmailConfigured: isImapConfigured(),
  });
});

// Toggle dry run
app.post("/api/config/dry-run", (req, res) => {
  const dryRun = req.body.dryRun ?? req.body.enabled ?? true;
  process.env.DRY_RUN = dryRun ? "true" : "false";
  res.json({ dryRun: process.env.DRY_RUN !== "false" });
});

// Mount route groups
app.use("/api/marketdata", marketdataRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/listing", listingRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/bid", bidRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/import", importRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/chart-data", chartdataRoutes);
app.use("/api/restaurant", restaurantRoutes);
// Note: /api/upload is mounted before requireAuth so images are publicly accessible

// Production: serve React build from Express
if (isProduction) {
  const uiDist = path.join(__dirname, "..", "ui", "dist");

  // Gate all UI access behind auth — unauthenticated users get redirected to Google OAuth
  app.use((req, res, next) => {
    if (req.path.startsWith("/auth/") || req.path.startsWith("/api/")) return next();
    if (isAuthEnabled() && !req.isAuthenticated()) {
      const returnTo = encodeURIComponent(req.originalUrl);
      return res.redirect(`/auth/google?returnTo=${returnTo}`);
    }
    next();
  });

  app.use(express.static(uiDist));

  // SPA fallback — all non-API routes serve index.html
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) return next();
    res.sendFile(path.join(uiDist, "index.html"));
  });
}

// Initialize database on startup (non-blocking)
async function initDatabase() {
  if (!hasDatabase()) {
    console.log("  Database: NOT CONFIGURED (memory features disabled)");
    return;
  }
  try {
    await runMigration();
    console.log("  Database: CONNECTED (3-tier memory active)");
  } catch (err) {
    console.error("  Database: MIGRATION FAILED —", err instanceof Error ? err.message : err);
  }
}

// Periodic data collection (every 4 hours)
const COLLECTION_INTERVAL_MS = 4 * 60 * 60 * 1000;
let collectionTimer: ReturnType<typeof setInterval> | null = null;

function startPeriodicCollection() {
  if (!hasDatabase() || !process.env.AT_API_KEY) return;

  console.log("  Collector: Scheduled (every 4 hours)");
  collectionTimer = setInterval(async () => {
    console.log("\n  [collector] Running scheduled collection...");
    try {
      const result = await runCollection(7, 10);
      console.log(`  [collector] Done: ${result.tradesStored} trades, ${result.snapshotsStored} snapshots`);
    } catch (err) {
      console.error("  [collector] Scheduled collection failed:", err instanceof Error ? err.message : err);
    }
  }, COLLECTION_INTERVAL_MS);
}

// Graceful shutdown
function shutdown() {
  console.log("\n  Shutting down...");
  stopEmailScanner();
  stopPortfolioMonitor();
  if (collectionTimer) clearInterval(collectionTimer);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen(PORT, async () => {
  console.log(`\n  AT Edge Server v0.2.2`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Mode: ${process.env.DRY_RUN !== "false" ? "DRY RUN" : "LIVE"}`);
  console.log(`  AT API: ${process.env.AT_API_KEY ? "configured" : "MISSING"}`);
  console.log(`  Claude: ${process.env.ANTHROPIC_API_KEY ? "configured" : "MISSING"}`);
  console.log(`  Apify: ${process.env.APIFY_API_TOKEN ? "configured" : "NOT SET (restaurant enrichment limited)"}`);
  console.log(`  Gmail: ${isImapConfigured() ? `IMAP (${process.env.GMAIL_USER})` : "NOT CONFIGURED (set GMAIL_USER + GMAIL_APP_PASSWORD)"}`);
  console.log(`  Telegram: ${isNotifierConfigured() ? "configured" : "NOT CONFIGURED (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)"}`);

  await initDatabase();
  startPeriodicCollection();
  startEmailScanner();
  startPortfolioMonitor();
  console.log("");
});
