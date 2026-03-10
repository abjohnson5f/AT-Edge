-- AT Edge Database Schema
-- 3-Tier Memory Architecture + Operational Tables
-- Neon Postgres with pgvector

-- Enable pgvector for semantic search (Tier QMD)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TIER 1: TACIT KNOWLEDGE (agent_memory)
-- Learned patterns, market intuitions, strategy preferences.
-- Updated by the agent when it discovers durable patterns.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_memory (
  id            SERIAL PRIMARY KEY,
  category      TEXT NOT NULL,                   -- 'market_pattern' | 'pricing_strategy' | 'user_preference' | 'operational'
  fact          TEXT NOT NULL,                    -- The actual insight
  confidence    REAL NOT NULL DEFAULT 0.5,        -- 0.0-1.0, increases with corroborating evidence
  source_session_id INTEGER,                      -- Session that created this insight
  status        TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'superseded' | 'disproven'
  superseded_by INTEGER REFERENCES agent_memory(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count  INTEGER NOT NULL DEFAULT 0,
  decay_tier    TEXT NOT NULL DEFAULT 'hot'       -- 'hot' (7d) | 'warm' (8-30d) | 'cold' (30+d)
);

CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_status ON agent_memory(status);
CREATE INDEX IF NOT EXISTS idx_memory_decay ON agent_memory(decay_tier);

-- ============================================================
-- TIER 2: SESSION LOGS (agent_sessions)
-- Every agent invocation: prompt, tools called, response, outcome.
-- The "daily notes" equivalent — what happened and when.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            SERIAL PRIMARY KEY,
  session_type  TEXT NOT NULL,                    -- 'scout' | 'import' | 'portfolio_review' | 'price_check' | 'freeform'
  system_prompt TEXT,
  user_message  TEXT NOT NULL,
  agent_response TEXT,
  tool_calls    JSONB NOT NULL DEFAULT '[]',      -- Array of {name, input, result_summary}
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  model         TEXT,
  duration_ms   INTEGER,
  outcome       TEXT,                             -- 'success' | 'error' | 'partial'
  outcome_data  JSONB,                            -- Structured result (e.g., parsed import, pricing recommendation)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_type ON agent_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON agent_sessions(created_at DESC);

-- ============================================================
-- TIER 3: MARKET KNOWLEDGE GRAPH (entities + facts)
-- Deep storage organized by entity (locations, trades, listings).
-- Atomic facts with access tracking and decay.
-- ============================================================

-- Location entities — every AT location we've interacted with
CREATE TABLE IF NOT EXISTS locations (
  id            SERIAL PRIMARY KEY,
  alias         TEXT NOT NULL UNIQUE,             -- AT location slug (e.g. 'carbone-new-york')
  name          TEXT NOT NULL,
  city          TEXT,
  cuisine_type  TEXT,
  summary       TEXT,                             -- Agent-generated summary, refreshed periodically
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_locations_alias ON locations(alias);

-- Location facts — atomic facts about locations with decay
CREATE TABLE IF NOT EXISTS location_facts (
  id              SERIAL PRIMARY KEY,
  location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  fact_type       TEXT NOT NULL,                  -- 'conversion_rate' | 'bid_ask_ratio' | 'avg_price' | 'demand_trend' | 'insight'
  fact            TEXT NOT NULL,
  numeric_value   REAL,                           -- For quantitative facts
  source_session_id INTEGER REFERENCES agent_sessions(id),
  status          TEXT NOT NULL DEFAULT 'active',
  superseded_by   INTEGER REFERENCES location_facts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count    INTEGER NOT NULL DEFAULT 0,
  decay_tier      TEXT NOT NULL DEFAULT 'hot'
);

CREATE INDEX IF NOT EXISTS idx_loc_facts_location ON location_facts(location_id);
CREATE INDEX IF NOT EXISTS idx_loc_facts_type ON location_facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_loc_facts_decay ON location_facts(decay_tier);

-- ============================================================
-- OPERATIONAL TABLES
-- Raw data that feeds INTO the memory system
-- ============================================================

-- Trade history — every comparable trade we've pulled
CREATE TABLE IF NOT EXISTS trades (
  id                SERIAL PRIMARY KEY,
  location_alias    TEXT NOT NULL,
  location_name     TEXT,
  price_cents       INTEGER NOT NULL,
  trade_date        TIMESTAMPTZ,
  inventory_type_id INTEGER,
  inventory_type    TEXT,
  source            TEXT NOT NULL DEFAULT 'comparable_trades', -- 'comparable_trades' | 'completed_order'
  at_trade_id       TEXT,                         -- AT's trade ID if available
  raw_data          JSONB,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(at_trade_id)                             -- Deduplicate
);

CREATE INDEX IF NOT EXISTS idx_trades_location ON trades(location_alias);
CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_fetched ON trades(fetched_at DESC);

-- Listings — our listings with full lifecycle tracking
CREATE TABLE IF NOT EXISTS listings (
  id                  SERIAL PRIMARY KEY,
  at_listing_id       TEXT UNIQUE,                -- AT's listing ID
  location_alias      TEXT NOT NULL,
  location_name       TEXT,
  inventory_type_id   INTEGER,
  price_cents         INTEGER NOT NULL,
  cost_basis_cents    INTEGER,                    -- What we paid for the reservation (if any)
  status              TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'sold' | 'expired' | 'archived'
  date_time           TIMESTAMPTZ,
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT,
  phone               TEXT,
  confirmation_number TEXT,
  is_dry_run          BOOLEAN NOT NULL DEFAULT TRUE,
  agent_reasoning     TEXT,                       -- Why the agent recommended this price
  source_session_id   INTEGER REFERENCES agent_sessions(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at             TIMESTAMPTZ,
  sold_price_cents    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location_alias);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);

-- Listing price changes — track every price adjustment
CREATE TABLE IF NOT EXISTS listing_price_history (
  id              SERIAL PRIMARY KEY,
  listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_price_cents INTEGER NOT NULL,
  new_price_cents INTEGER NOT NULL,
  reason          TEXT,
  session_id      INTEGER REFERENCES agent_sessions(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Imports — parsed reservation emails and their outcomes
CREATE TABLE IF NOT EXISTS imports (
  id                  SERIAL PRIMARY KEY,
  email_subject       TEXT,
  email_body_hash     TEXT,                       -- SHA-256 hash for dedup
  parsed_data         JSONB,                      -- Full parsed result
  location_alias      TEXT,
  location_matched    BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_price   INTEGER,
  actual_price        INTEGER,                    -- What was actually listed at
  listing_id          INTEGER REFERENCES listings(id),
  agent_reasoning     TEXT,
  session_id          INTEGER REFERENCES agent_sessions(id),
  status              TEXT NOT NULL DEFAULT 'parsed', -- 'parsed' | 'listed' | 'skipped' | 'failed'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status);
CREATE INDEX IF NOT EXISTS idx_imports_hash ON imports(email_body_hash);

-- Market snapshots — periodic captures of market state
CREATE TABLE IF NOT EXISTS market_snapshots (
  id              SERIAL PRIMARY KEY,
  snapshot_type   TEXT NOT NULL,                   -- 'scout_report' | 'highest_converting' | 'underserved' | 'bid_imbalance' | 'toplist'
  data            JSONB NOT NULL,
  session_id      INTEGER REFERENCES agent_sessions(id),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_type ON market_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON market_snapshots(captured_at DESC);

-- Account ledger — deposits, withdrawals, fees, revenue for P&L
CREATE TABLE IF NOT EXISTS account_ledger (
  id              SERIAL PRIMARY KEY,
  entry_type      TEXT NOT NULL,                  -- 'deposit' | 'withdrawal' | 'sale_revenue' | 'listing_fee' | 'platform_fee'
  amount_cents    INTEGER NOT NULL,               -- Positive = credit, negative = debit
  listing_id      INTEGER REFERENCES listings(id),
  description     TEXT,
  at_transaction_id TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_type ON account_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_recorded ON account_ledger(recorded_at DESC);

-- ============================================================
-- RESTAURANT PROFILES CACHE (Apify + Claude enrichment)
-- Caches scraped web data + AI analysis per restaurant.
-- TTL-based: re-enriched after 7 days.
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_profiles (
  id              SERIAL PRIMARY KEY,
  location_alias  TEXT NOT NULL UNIQUE,           -- AT alias (e.g. 'carbone-new-york')
  restaurant_name TEXT NOT NULL,
  scraped_data    JSONB NOT NULL DEFAULT '{}',    -- Raw Apify results (ratings, reviews, address, hours, etc.)
  ai_analysis     TEXT,                           -- Claude-generated intelligence report
  cuisine_type    TEXT,
  address         TEXT,
  phone           TEXT,
  website         TEXT,
  rating          REAL,                           -- Aggregate rating (Google/Yelp)
  review_count    INTEGER,
  price_level     TEXT,                           -- '$' | '$$' | '$$$' | '$$$$'
  photo_urls      JSONB DEFAULT '[]',             -- Array of image URLs
  highlights      JSONB DEFAULT '[]',             -- AI-extracted key highlights
  enriched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_profiles_alias ON restaurant_profiles(location_alias);
CREATE INDEX IF NOT EXISTS idx_restaurant_profiles_enriched ON restaurant_profiles(enriched_at);

-- ============================================================
-- QMD: SEMANTIC SEARCH LAYER (memory_embeddings)
-- pgvector embeddings across all 3 tiers for retrieval
-- ============================================================

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id              SERIAL PRIMARY KEY,
  source_table    TEXT NOT NULL,                   -- 'agent_memory' | 'agent_sessions' | 'location_facts' | 'trades'
  source_id       INTEGER NOT NULL,
  content_text    TEXT NOT NULL,                    -- The text that was embedded
  embedding       vector(1536),                    -- OpenAI text-embedding-3-small dimension
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON memory_embeddings(source_table, source_id);

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- Active tacit knowledge (hot + warm only)
CREATE OR REPLACE VIEW active_memory AS
SELECT * FROM agent_memory
WHERE status = 'active' AND decay_tier IN ('hot', 'warm')
ORDER BY access_count DESC, last_accessed DESC;

-- P&L summary
CREATE OR REPLACE VIEW pnl_summary AS
SELECT
  l.id,
  l.location_name,
  l.price_cents AS list_price,
  l.cost_basis_cents,
  l.sold_price_cents,
  l.sold_price_cents - COALESCE(l.cost_basis_cents, 0) AS gross_profit_cents,
  l.status,
  l.created_at,
  l.sold_at
FROM listings l
WHERE l.status IN ('sold', 'active', 'expired');

-- Daily OHLC aggregation from trades (for chart rendering)
CREATE OR REPLACE VIEW daily_ohlc AS
SELECT
  location_alias,
  DATE(trade_date) AS trade_day,
  (ARRAY_AGG(price_cents ORDER BY trade_date ASC))[1] AS open_cents,
  MAX(price_cents) AS high_cents,
  MIN(price_cents) AS low_cents,
  (ARRAY_AGG(price_cents ORDER BY trade_date DESC))[1] AS close_cents,
  COUNT(*) AS volume
FROM trades
WHERE trade_date IS NOT NULL
GROUP BY location_alias, DATE(trade_date)
ORDER BY location_alias, trade_day;

-- Location intelligence rollup
CREATE OR REPLACE VIEW location_intelligence AS
SELECT
  loc.alias,
  loc.name,
  loc.summary,
  loc.access_count,
  COUNT(DISTINCT t.id) AS trade_count,
  AVG(t.price_cents) AS avg_trade_price_cents,
  COUNT(DISTINCT lf.id) AS fact_count,
  MAX(t.fetched_at) AS last_trade_fetched,
  MAX(lf.created_at) AS last_fact_created
FROM locations loc
LEFT JOIN trades t ON t.location_alias = loc.alias
LEFT JOIN location_facts lf ON lf.location_id = loc.id AND lf.status = 'active'
GROUP BY loc.id, loc.alias, loc.name, loc.summary, loc.access_count;

-- ============================================================
-- DECAY MANAGEMENT FUNCTION
-- Run nightly to update decay tiers
-- ============================================================

CREATE OR REPLACE FUNCTION update_decay_tiers() RETURNS void AS $$
BEGIN
  -- Agent memory decay
  UPDATE agent_memory SET decay_tier = 'cold', updated_at = NOW()
  WHERE status = 'active' AND last_accessed < NOW() - INTERVAL '30 days' AND decay_tier != 'cold';

  UPDATE agent_memory SET decay_tier = 'warm', updated_at = NOW()
  WHERE status = 'active' AND last_accessed >= NOW() - INTERVAL '30 days'
    AND last_accessed < NOW() - INTERVAL '7 days' AND decay_tier != 'warm';

  UPDATE agent_memory SET decay_tier = 'hot', updated_at = NOW()
  WHERE status = 'active' AND last_accessed >= NOW() - INTERVAL '7 days' AND decay_tier != 'hot';

  -- Location facts decay
  UPDATE location_facts SET decay_tier = 'cold'
  WHERE status = 'active' AND last_accessed < NOW() - INTERVAL '30 days' AND decay_tier != 'cold';

  UPDATE location_facts SET decay_tier = 'warm'
  WHERE status = 'active' AND last_accessed >= NOW() - INTERVAL '30 days'
    AND last_accessed < NOW() - INTERVAL '7 days' AND decay_tier != 'warm';

  UPDATE location_facts SET decay_tier = 'hot'
  WHERE status = 'active' AND last_accessed >= NOW() - INTERVAL '7 days' AND decay_tier != 'hot';
END;
$$ LANGUAGE plpgsql;
