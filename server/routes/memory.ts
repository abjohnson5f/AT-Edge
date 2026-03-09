import { Router } from "express";
import {
  hasDatabase,
  getActiveMemory,
  getRecentSessions,
  getLocationIntelligence,
  learnFact,
  supersedeFact,
  runDecayCycle,
  queryMany,
} from "../db/index.js";

export const memoryRoutes = Router();

// Middleware: require database
memoryRoutes.use((_req, res, next) => {
  if (!hasDatabase()) {
    return res.status(503).json({
      error: "Database not configured. Set DATABASE_URL to enable memory features.",
    });
  }
  next();
});

// GET /api/memory/tacit — Tier 1: Active learned patterns
memoryRoutes.get("/tacit", async (_req, res) => {
  try {
    const memories = await getActiveMemory();
    res.json({ memories, count: memories.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/memory/sessions — Tier 2: Recent session logs
memoryRoutes.get("/sessions", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const limit = Number(req.query.limit ?? 20);
    const sessions = await getRecentSessions(type, limit);
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/memory/location/:alias — Tier 3: Location intelligence
memoryRoutes.get("/location/:alias", async (req, res) => {
  try {
    const intel = await getLocationIntelligence(req.params.alias);
    res.json(intel);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/memory/locations — All known locations
memoryRoutes.get("/locations", async (_req, res) => {
  try {
    const locations = await queryMany(
      `SELECT * FROM locations ORDER BY access_count DESC, last_seen DESC`
    );
    res.json({ locations, count: locations.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/memory/learn — Manually add a fact
memoryRoutes.post("/learn", async (req, res) => {
  try {
    const { category, fact, confidence } = req.body;
    if (!category || !fact) {
      return res.status(400).json({ error: "category and fact are required" });
    }
    const id = await learnFact(category, fact, confidence ?? 0.5);
    res.json({ stored: true, factId: id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/memory/supersede — Supersede a fact with a new one
memoryRoutes.post("/supersede", async (req, res) => {
  try {
    const { oldFactId, newFact, confidence } = req.body;
    if (!oldFactId || !newFact) {
      return res.status(400).json({ error: "oldFactId and newFact are required" });
    }
    const newId = await supersedeFact(oldFactId, newFact, confidence ?? 0.5);
    res.json({ superseded: true, oldFactId, newFactId: newId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/memory/decay — Run decay cycle manually
memoryRoutes.post("/decay", async (_req, res) => {
  try {
    await runDecayCycle();
    res.json({ success: true, message: "Decay cycle completed" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/memory/stats — Memory system statistics
memoryRoutes.get("/stats", async (_req, res) => {
  try {
    const stats = await queryMany(`
      SELECT 'agent_memory' AS table_name, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'active') AS active,
             COUNT(*) FILTER (WHERE decay_tier = 'hot') AS hot,
             COUNT(*) FILTER (WHERE decay_tier = 'warm') AS warm,
             COUNT(*) FILTER (WHERE decay_tier = 'cold') AS cold
      FROM agent_memory
      UNION ALL
      SELECT 'agent_sessions', COUNT(*), NULL, NULL, NULL, NULL FROM agent_sessions
      UNION ALL
      SELECT 'locations', COUNT(*), NULL, NULL, NULL, NULL FROM locations
      UNION ALL
      SELECT 'location_facts', COUNT(*),
             COUNT(*) FILTER (WHERE status = 'active'), NULL, NULL, NULL
      FROM location_facts
      UNION ALL
      SELECT 'trades', COUNT(*), NULL, NULL, NULL, NULL FROM trades
      UNION ALL
      SELECT 'listings', COUNT(*),
             COUNT(*) FILTER (WHERE status = 'active'), NULL, NULL, NULL
      FROM listings
      UNION ALL
      SELECT 'imports', COUNT(*), NULL, NULL, NULL, NULL FROM imports
      UNION ALL
      SELECT 'market_snapshots', COUNT(*), NULL, NULL, NULL, NULL FROM market_snapshots
    `);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
