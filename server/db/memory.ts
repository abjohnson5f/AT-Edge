/**
 * AT Edge 3-Tier Memory System
 *
 * Tier 1: Tacit Knowledge (agent_memory) — learned patterns, market intuitions
 * Tier 2: Session Logs (agent_sessions) — every agent invocation with tools & outcomes
 * Tier 3: Knowledge Graph (locations, location_facts, trades) — entity facts with decay
 *
 * Inspired by the Felix Playbook's QMD architecture.
 */

import { query, queryOne, queryMany, hasDatabase } from "./client.js";

// ── Tier 1: Tacit Knowledge ──

export interface AgentMemory {
  id: number;
  category: string;
  fact: string;
  confidence: number;
  status: string;
  decay_tier: string;
  access_count: number;
  last_accessed: Date;
  created_at: Date;
}

/** Store a new learned pattern */
export async function learnFact(
  category: string,
  fact: string,
  confidence = 0.5,
  sessionId?: number
): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO agent_memory (category, fact, confidence, source_session_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [category, fact, confidence, sessionId ?? null]
  );
  return result!.id;
}

/** Supersede a fact with a new one (never delete, always supersede) */
export async function supersedeFact(
  oldFactId: number,
  newFact: string,
  newConfidence = 0.5,
  sessionId?: number
): Promise<number> {
  const row = await queryOne<{ category: string }>(
    `SELECT category FROM agent_memory WHERE id = $1`,
    [oldFactId]
  );
  if (!row) throw new Error(`Fact ${oldFactId} not found`);

  const newId = await learnFact(row.category, newFact, newConfidence, sessionId);

  await query(
    `UPDATE agent_memory SET status = 'superseded', superseded_by = $1, updated_at = NOW()
     WHERE id = $2`,
    [newId, oldFactId]
  );

  return newId;
}

/** Get active memory (hot + warm) for injection into agent prompts */
export async function getActiveMemory(): Promise<AgentMemory[]> {
  return queryMany<AgentMemory>(
    `SELECT * FROM agent_memory
     WHERE status = 'active' AND decay_tier IN ('hot', 'warm')
     ORDER BY access_count DESC, last_accessed DESC
     LIMIT 50`
  );
}

/** Touch a fact — bump access count and last_accessed, reheat if cold */
export async function touchFact(factId: number): Promise<void> {
  await query(
    `UPDATE agent_memory
     SET last_accessed = NOW(), access_count = access_count + 1,
         decay_tier = 'hot', updated_at = NOW()
     WHERE id = $1`,
    [factId]
  );
}

// ── Tier 2: Session Logs ──

export interface SessionLog {
  id: number;
  session_type: string;
  user_message: string;
  agent_response: string | null;
  tool_calls: Array<{ name: string; input?: unknown; result_summary?: string }>;
  tokens_in: number | null;
  tokens_out: number | null;
  duration_ms: number | null;
  outcome: string | null;
  outcome_data: unknown;
  created_at: Date;
}

/** Start a session — returns the session ID for logging tool calls */
export async function startSession(
  sessionType: string,
  userMessage: string,
  systemPrompt?: string
): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO agent_sessions (session_type, system_prompt, user_message)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [sessionType, systemPrompt ?? null, userMessage]
  );
  return result!.id;
}

/** Complete a session with results */
export async function completeSession(
  sessionId: number,
  data: {
    agentResponse: string;
    toolCalls: Array<{ name: string; result: string }>;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    outcome: "success" | "error" | "partial";
    outcomeData?: unknown;
  }
): Promise<void> {
  await query(
    `UPDATE agent_sessions
     SET agent_response = $1, tool_calls = $2,
         tokens_in = $3, tokens_out = $4, duration_ms = $5,
         outcome = $6, outcome_data = $7
     WHERE id = $8`,
    [
      data.agentResponse,
      JSON.stringify(data.toolCalls),
      data.tokensIn ?? null,
      data.tokensOut ?? null,
      data.durationMs ?? null,
      data.outcome,
      data.outcomeData ? JSON.stringify(data.outcomeData) : null,
      sessionId,
    ]
  );
}

/** Get recent sessions for context */
export async function getRecentSessions(
  type?: string,
  limit = 10
): Promise<SessionLog[]> {
  if (type) {
    return queryMany<SessionLog>(
      `SELECT * FROM agent_sessions WHERE session_type = $1
       ORDER BY created_at DESC LIMIT $2`,
      [type, limit]
    );
  }
  return queryMany<SessionLog>(
    `SELECT * FROM agent_sessions ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
}

// ── Tier 3: Knowledge Graph ──

export interface LocationEntity {
  id: number;
  alias: string;
  name: string;
  city: string | null;
  summary: string | null;
  access_count: number;
}

/** Upsert a location entity — creates or updates last_seen */
export async function upsertLocation(
  alias: string,
  name: string,
  city?: string
): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO locations (alias, name, city)
     VALUES ($1, $2, $3)
     ON CONFLICT (alias) DO UPDATE
       SET last_seen = NOW(), access_count = locations.access_count + 1,
           name = COALESCE(EXCLUDED.name, locations.name)
     RETURNING id`,
    [alias, name, city ?? null]
  );
  return result!.id;
}

/** Add a fact to a location's knowledge graph */
export async function addLocationFact(
  locationId: number,
  factType: string,
  fact: string,
  numericValue?: number,
  sessionId?: number
): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO location_facts (location_id, fact_type, fact, numeric_value, source_session_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [locationId, factType, fact, numericValue ?? null, sessionId ?? null]
  );
  return result!.id;
}

/** Get location intelligence for injection into agent prompts */
export async function getLocationIntelligence(alias: string): Promise<{
  location: LocationEntity | null;
  facts: Array<{ fact_type: string; fact: string; numeric_value: number | null; decay_tier: string }>;
  recentTrades: Array<{ price_cents: number; trade_date: Date }>;
}> {
  const location = await queryOne<LocationEntity>(
    `UPDATE locations SET access_count = access_count + 1, last_seen = NOW()
     WHERE alias = $1
     RETURNING *`,
    [alias]
  );

  if (!location) return { location: null, facts: [], recentTrades: [] };

  const facts = await queryMany(
    `UPDATE location_facts
     SET last_accessed = NOW(), access_count = access_count + 1, decay_tier = 'hot'
     WHERE location_id = $1 AND status = 'active' AND decay_tier IN ('hot', 'warm')
     RETURNING fact_type, fact, numeric_value, decay_tier`,
    [location.id]
  );

  const recentTrades = await queryMany(
    `SELECT price_cents, trade_date FROM trades
     WHERE location_alias = $1
     ORDER BY trade_date DESC LIMIT 20`,
    [alias]
  );

  return { location, facts, recentTrades };
}

// ── Operational: Trades ──

/** Store comparable trades (deduplicates by at_trade_id) */
export async function storeTrades(
  locationAlias: string,
  locationName: string,
  trades: Array<{
    id?: string;
    priceCents: number;
    tradeDate?: string;
    inventoryTypeId?: number;
    inventoryType?: string;
    raw?: unknown;
  }>
): Promise<number> {
  let stored = 0;
  for (const trade of trades) {
    try {
      await query(
        `INSERT INTO trades (location_alias, location_name, price_cents, trade_date,
                            inventory_type_id, inventory_type, at_trade_id, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (at_trade_id) DO NOTHING`,
        [
          locationAlias,
          locationName,
          trade.priceCents,
          trade.tradeDate ?? null,
          trade.inventoryTypeId ?? null,
          trade.inventoryType ?? null,
          trade.id ?? null,
          trade.raw ? JSON.stringify(trade.raw) : null,
        ]
      );
      stored++;
    } catch {
      // Skip duplicates or invalid data
    }
  }
  return stored;
}

// ── Operational: Listings ──

/** Record a listing creation */
export async function recordListing(data: {
  atListingId?: string;
  locationAlias: string;
  locationName?: string;
  inventoryTypeId?: number;
  priceCents: number;
  costBasisCents?: number;
  dateTime?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  confirmationNumber?: string;
  isDryRun: boolean;
  agentReasoning?: string;
  sessionId?: number;
}): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO listings (
      at_listing_id, location_alias, location_name, inventory_type_id,
      price_cents, cost_basis_cents, date_time, first_name, last_name,
      email, phone, confirmation_number, is_dry_run, agent_reasoning,
      source_session_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id`,
    [
      data.atListingId ?? null,
      data.locationAlias,
      data.locationName ?? null,
      data.inventoryTypeId ?? null,
      data.priceCents,
      data.costBasisCents ?? null,
      data.dateTime ?? null,
      data.firstName ?? null,
      data.lastName ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.confirmationNumber ?? null,
      data.isDryRun,
      data.agentReasoning ?? null,
      data.sessionId ?? null,
      data.isDryRun ? "draft" : "active",
    ]
  );
  return result!.id;
}

// ── Operational: Imports ──

/** Record a parsed import */
export async function recordImport(data: {
  emailSubject?: string;
  emailBodyHash: string;
  parsedData: unknown;
  locationAlias?: string;
  locationMatched: boolean;
  recommendedPrice?: number;
  agentReasoning?: string;
  sessionId?: number;
}): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO imports (
      email_subject, email_body_hash, parsed_data, location_alias,
      location_matched, recommended_price, agent_reasoning, session_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      data.emailSubject ?? null,
      data.emailBodyHash,
      JSON.stringify(data.parsedData),
      data.locationAlias ?? null,
      data.locationMatched,
      data.recommendedPrice ?? null,
      data.agentReasoning ?? null,
      data.sessionId ?? null,
    ]
  );
  return result!.id;
}

// ── Operational: Market Snapshots ──

/** Store a market snapshot */
export async function storeSnapshot(
  snapshotType: string,
  data: unknown,
  sessionId?: number
): Promise<number> {
  const result = await queryOne<{ id: number }>(
    `INSERT INTO market_snapshots (snapshot_type, data, session_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [snapshotType, JSON.stringify(data), sessionId ?? null]
  );
  return result!.id;
}

// ── Memory Context Builder ──
// Builds the memory context string injected into agent system prompts

export async function buildMemoryContext(
  locationAlias?: string
): Promise<string> {
  if (!hasDatabase()) return "";

  const parts: string[] = ["## Memory Context (from previous sessions)\n"];

  try {
    // Tier 1: Active tacit knowledge
    const memories = await getActiveMemory();
    if (memories.length > 0) {
      parts.push("### Learned Patterns");
      for (const m of memories) {
        parts.push(
          `- [${m.category}] ${m.fact} (confidence: ${m.confidence.toFixed(1)}, used ${m.access_count}x)`
        );
      }
      parts.push("");
    }

    // Tier 2: Recent sessions of same type
    const recent = await getRecentSessions(undefined, 5);
    if (recent.length > 0) {
      parts.push("### Recent Agent Activity");
      for (const s of recent) {
        const date = new Date(s.created_at).toLocaleDateString("en-US");
        const tools = s.tool_calls?.map((t: { name: string }) => t.name).join(", ") ?? "none";
        parts.push(`- ${date} [${s.session_type}]: ${s.outcome ?? "?"} (tools: ${tools})`);
      }
      parts.push("");
    }

    // Tier 3: Location-specific intelligence
    if (locationAlias) {
      const intel = await getLocationIntelligence(locationAlias);
      if (intel.location) {
        parts.push(`### Known Intel: ${intel.location.name} (${locationAlias})`);
        if (intel.location.summary) parts.push(intel.location.summary);
        for (const f of intel.facts) {
          parts.push(`- [${f.fact_type}] ${f.fact}${f.numeric_value != null ? ` (${f.numeric_value})` : ""}`);
        }
        if (intel.recentTrades.length > 0) {
          const prices = intel.recentTrades.map((t) => t.price_cents);
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          parts.push(
            `- Trade history: ${intel.recentTrades.length} trades, avg $${(avg / 100).toFixed(2)}, range $${(min / 100).toFixed(2)}-$${(max / 100).toFixed(2)}`
          );
        }
        parts.push("");
      }
    }
  } catch (err) {
    parts.push(`(Memory retrieval error: ${err instanceof Error ? err.message : String(err)})`);
  }

  return parts.length > 1 ? parts.join("\n") : "";
}

// ── Decay Management ──

export async function runDecayCycle(): Promise<void> {
  await query(`SELECT update_decay_tiers()`);
}
