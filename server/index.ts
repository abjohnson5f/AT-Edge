import express from "express";
import cors from "cors";
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
import { hasDatabase, runMigration } from "./db/index.js";

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT ?? 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

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
    gmailConfigured:
      !!process.env.GMAIL_CLIENT_ID && !!process.env.GMAIL_REFRESH_TOKEN,
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

app.listen(PORT, async () => {
  console.log(`\n  AT Edge Server v0.1.0`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Mode: ${process.env.DRY_RUN !== "false" ? "DRY RUN" : "LIVE"}`);
  console.log(`  AT API: ${process.env.AT_API_KEY ? "configured" : "MISSING"}`);
  console.log(`  Claude: ${process.env.ANTHROPIC_API_KEY ? "configured" : "MISSING"}`);
  await initDatabase();
  console.log("");
});
