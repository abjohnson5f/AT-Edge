import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { hasDatabase, queryOne, queryMany, query } from "../db/index.js";

export const restaurantRoutes = Router();

const APIFY_TOKEN = () => process.env.APIFY_API_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
const CACHE_TTL_DAYS = 7;

// ── Types ──

interface RestaurantProfile {
  locationAlias: string;
  restaurantName: string;
  cuisineType: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  photoUrls: string[];
  highlights: string[];
  aiAnalysis: string | null;
  scrapedData: Record<string, unknown>;
  enrichedAt: string;
  tradingContext?: {
    tradeCount: number;
    avgPriceCents: number;
    recentTrades: Array<{ date: string; priceCents: number }>;
  };
}

// ── GET /api/restaurant/:alias/profile ──
// Returns enriched restaurant profile with Apify data + Claude analysis.
// Caches in Neon for CACHE_TTL_DAYS days.

restaurantRoutes.get("/:alias/profile", async (req, res) => {
  const { alias } = req.params;
  const forceRefresh = req.query.refresh === "true";

  try {
    // 1. Check cache (if DB available)
    if (hasDatabase() && !forceRefresh) {
      const cached = await queryOne(
        `SELECT * FROM restaurant_profiles
         WHERE location_alias = $1
         AND enriched_at > NOW() - INTERVAL '${CACHE_TTL_DAYS} days'`,
        [alias]
      );

      if (cached) {
        // Also fetch trading context from Neon
        const tradingCtx = await getTradingContext(alias);
        const profile = rowToProfile(cached, tradingCtx);
        return res.json({ profile, source: "cache" });
      }
    }

    // 2. Get restaurant name from locations table or alias
    let restaurantName = alias.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    if (hasDatabase()) {
      const loc = await queryOne(
        `SELECT name, city, cuisine_type FROM locations WHERE alias = $1`,
        [alias]
      );
      if (loc?.name) restaurantName = loc.name;
    }

    // 3. Scrape via Apify rag-web-browser
    let scrapedData: Record<string, unknown> = {};
    let scrapedMarkdown = "";

    if (APIFY_TOKEN()) {
      try {
        const apifyResult = await callApifyRagBrowser(restaurantName, alias);
        scrapedData = apifyResult.structured;
        scrapedMarkdown = apifyResult.markdown;
      } catch (err) {
        console.warn(`[restaurant] Apify scrape failed for ${alias}:`, err instanceof Error ? err.message : err);
      }
    } else {
      console.warn("[restaurant] APIFY_API_TOKEN not set — skipping web enrichment");
    }

    // 4. Get trading context from Neon
    const tradingCtx = hasDatabase() ? await getTradingContext(alias) : undefined;

    // 5. Claude Agent SDK — generate intelligent analysis
    let aiAnalysis: string | null = null;
    let aiStructured: AIAnalysisResult["structured"] | null = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const result = await generateAIAnalysis(restaurantName, alias, scrapedMarkdown, tradingCtx);
        aiAnalysis = result.analysis;
        aiStructured = result.structured;
      } catch (err) {
        console.warn(`[restaurant] Claude analysis failed for ${alias}:`, err instanceof Error ? err.message : err);
      }
    }

    // 6. Extract structured fields from scraped data
    const extracted = extractStructuredFields(scrapedData, scrapedMarkdown);

    // Use Claude's structured data as fallback when Apify fields are missing
    if (aiStructured) {
      if (!extracted.rating && aiStructured.rating) extracted.rating = aiStructured.rating;
      if (!extracted.priceLevel && aiStructured.priceLevel) extracted.priceLevel = aiStructured.priceLevel;
      if (!extracted.cuisineType && aiStructured.cuisineType) extracted.cuisineType = aiStructured.cuisineType;
      if (extracted.highlights.length === 0 && aiStructured.highlights.length > 0) {
        extracted.highlights = aiStructured.highlights;
      }
    }

    // 7. Cache in Neon
    if (hasDatabase()) {
      await upsertProfile(alias, restaurantName, extracted, scrapedData, aiAnalysis);
    }

    // 8. Return enriched profile
    const profile: RestaurantProfile = {
      locationAlias: alias,
      restaurantName,
      cuisineType: extracted.cuisineType,
      address: extracted.address,
      phone: extracted.phone,
      website: extracted.website,
      rating: extracted.rating,
      reviewCount: extracted.reviewCount,
      priceLevel: extracted.priceLevel,
      photoUrls: extracted.photoUrls,
      highlights: extracted.highlights,
      aiAnalysis,
      scrapedData,
      enrichedAt: new Date().toISOString(),
      tradingContext: tradingCtx,
    };

    res.json({ profile, source: scrapedMarkdown ? "apify+claude" : "claude-only" });
  } catch (err) {
    console.error(`[restaurant] Profile enrichment failed for ${alias}:`, err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Apify RAG Web Browser ──

async function callApifyRagBrowser(
  restaurantName: string,
  alias: string
): Promise<{ markdown: string; structured: Record<string, unknown> }> {
  const token = APIFY_TOKEN();
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  // Search Google for restaurant info via Apify's rag-web-browser
  const searchQuery = `${restaurantName} restaurant reviews rating address hours`;

  const response = await fetch(
    `https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
        maxResults: 3,
        outputFormats: ["markdown"],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Apify API returned ${response.status}: ${response.statusText}`);
  }

  const items = await response.json() as Array<Record<string, unknown>>;

  // Combine all scraped page content
  const allMarkdown = items
    .map((item: Record<string, unknown>) => {
      const md = (item.markdown ?? item.text ?? "") as string;
      const url = (item.url ?? "") as string;
      return `## Source: ${url}\n\n${md}`;
    })
    .join("\n\n---\n\n");

  return {
    markdown: allMarkdown.substring(0, 15000), // Cap to avoid token explosion
    structured: {
      sources: items.map((item: Record<string, unknown>) => ({
        url: item.url,
        title: item.metadata?.title ?? item.title,
      })),
      itemCount: items.length,
      query: searchQuery,
    },
  };
}

// ── Claude AI Analysis ──

interface AIAnalysisResult {
  analysis: string;
  structured: {
    rating: number | null;
    priceLevel: string | null;
    cuisineType: string | null;
    highlights: string[];
  };
}

async function generateAIAnalysis(
  restaurantName: string,
  alias: string,
  scrapedMarkdown: string,
  tradingCtx?: { tradeCount: number; avgPriceCents: number; recentTrades: Array<{ date: string; priceCents: number }> }
): Promise<AIAnalysisResult> {
  const anthropic = new Anthropic();

  const tradingInfo = tradingCtx
    ? `\n\nAT EDGE TRADING DATA:\n- Total comparable trades: ${tradingCtx.tradeCount}\n- Average trade price: $${(tradingCtx.avgPriceCents / 100).toFixed(2)}\n- Recent trades: ${tradingCtx.recentTrades.slice(0, 5).map(t => `${t.date}: $${(t.priceCents / 100).toFixed(2)}`).join(", ")}`
    : "";

  const webInfo = scrapedMarkdown
    ? `\n\nWEB RESEARCH (scraped via Apify):\n${scrapedMarkdown}`
    : "\n\nNo web data was available for this restaurant.";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are AT Edge's restaurant intelligence analyst. You analyze restaurants listed on AppointmentTrader (a reservation trading marketplace) and provide actionable insights for traders.

Your analysis should be concise, data-driven, and focused on what matters for reservation trading:
- Restaurant prestige and demand drivers (Michelin stars, celebrity chef, viral moments)
- Reservation scarcity signals (long wait times, exclusive booking windows)
- Price trends and seasonality patterns
- Competitive positioning (similar restaurants, price comparisons)
- Risk factors (upcoming closures, chef departures, declining reviews)

Format your response as structured sections using markdown. Keep it under 400 words.`,
    messages: [
      {
        role: "user",
        content: `Analyze this restaurant for reservation trading potential:\n\nRESTAURANT: ${restaurantName}\nAT ALIAS: ${alias}${tradingInfo}${webInfo}\n\nProvide your analysis with these sections:\n## Trading Edge\nKey factors that drive reservation value\n\n## Market Position\nHow this restaurant compares in its market\n\n## Demand Signals\nWhat indicates reservation scarcity\n\n## Risk Factors\nThings to watch out for\n\n## Price Outlook\nExpected direction of reservation prices\n\nIMPORTANT: After your analysis, you MUST output a JSON block on its own line starting with STRUCTURED_DATA:\nYou MUST provide your best estimate for ALL fields — never use null if you can make a reasonable estimate based on the restaurant's reputation, price point, and cuisine.\n\nSTRUCTURED_DATA:\n{"rating": <your best estimate 1.0-5.0 as a number, e.g. 4.5>, "priceLevel": "<one of: $, $$, $$$, or $$$$>", "cuisineType": "<specific cuisine type, e.g. Italian-American, Japanese, French, Mexican Fine Dining>", "highlights": ["highlight1", "highlight2", "highlight3"]}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const fullText = textBlock?.text ?? "Analysis unavailable.";

  // Parse STRUCTURED_DATA JSON from the response
  let structured: AIAnalysisResult["structured"] = {
    rating: null,
    priceLevel: null,
    cuisineType: null,
    highlights: [],
  };

  const structuredMatch = fullText.match(/STRUCTURED_DATA:\s*(\{[\s\S]*?\})\s*$/);
  if (structuredMatch) {
    try {
      const parsed = JSON.parse(structuredMatch[1]);
      structured = {
        rating: typeof parsed.rating === "number" ? parsed.rating : null,
        priceLevel: typeof parsed.priceLevel === "string" ? parsed.priceLevel : null,
        cuisineType: typeof parsed.cuisineType === "string" ? parsed.cuisineType : null,
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      };
    } catch {
      // If JSON parsing fails, keep defaults
    }
  }

  // Remove the STRUCTURED_DATA line from the analysis text
  const analysis = fullText.replace(/\n*STRUCTURED_DATA:\s*\{[\s\S]*?\}\s*$/, "").trim();

  return { analysis, structured };
}

// ── Trading Context from Neon ──

async function getTradingContext(alias: string) {
  try {
    const stats = await queryOne(
      `SELECT COUNT(*) AS trade_count, AVG(price_cents) AS avg_price
       FROM trades WHERE location_alias = $1`,
      [alias]
    );

    const recentTrades = await queryMany(
      `SELECT trade_date::text AS date, price_cents
       FROM trades WHERE location_alias = $1
       ORDER BY trade_date DESC LIMIT 10`,
      [alias]
    );

    return {
      tradeCount: parseInt(stats?.trade_count ?? "0"),
      avgPriceCents: Math.round(parseFloat(stats?.avg_price ?? "0")),
      recentTrades: recentTrades.map((t) => ({
        date: t.date ?? "unknown",
        priceCents: t.price_cents,
      })),
    };
  } catch {
    return undefined;
  }
}

// ── Extract Structured Fields from Scraped Data ──

function extractStructuredFields(
  _scrapedData: Record<string, unknown>,
  markdown: string
): {
  cuisineType: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  photoUrls: string[];
  highlights: string[];
} {
  // Extract common patterns from scraped markdown
  const ratingMatch = markdown.match(/(\d\.\d)\s*(?:out of 5|\/5|stars?|rating)/i);
  const reviewCountMatch = markdown.match(/(\d[\d,]*)\s*(?:reviews?|ratings?)/i);
  const phoneMatch = markdown.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const priceLevelMatch = markdown.match(/Price\s*(?:level|range)?[:\s]*(\${1,4})/i)
    ?? markdown.match(/(\${2,4})\s*·/);
  const cuisineMatch = markdown.match(/(?:Cuisine|Type|Category)[:\s]+([A-Za-z\s,]+?)(?:\n|·|\|)/i);

  // Extract highlights — look for descriptive phrases
  const highlights: string[] = [];
  const michelinMatch = markdown.match(/(\d)\s*Michelin\s*star/i);
  if (michelinMatch) highlights.push(`${michelinMatch[1]} Michelin Star${parseInt(michelinMatch[1]) > 1 ? "s" : ""}`);

  const jamesBeardMatch = markdown.match(/James Beard/i);
  if (jamesBeardMatch) highlights.push("James Beard Recognition");

  const vibeMatch = markdown.match(/(?:known for|famous for|renowned for)\s+([^.]+)/i);
  if (vibeMatch) highlights.push(vibeMatch[1].trim().substring(0, 80));

  return {
    cuisineType: cuisineMatch?.[1]?.trim() ?? null,
    address: null, // Hard to reliably extract from unstructured text
    phone: phoneMatch?.[0] ?? null,
    website: null,
    rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
    reviewCount: reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, "")) : null,
    priceLevel: priceLevelMatch?.[1] ?? null,
    photoUrls: [],
    highlights,
  };
}

// ── Upsert Profile Cache ──

async function upsertProfile(
  alias: string,
  name: string,
  extracted: ReturnType<typeof extractStructuredFields>,
  scrapedData: Record<string, unknown>,
  aiAnalysis: string | null
) {
  await query(
    `INSERT INTO restaurant_profiles
       (location_alias, restaurant_name, scraped_data, ai_analysis, cuisine_type,
        address, phone, website, rating, review_count, price_level, photo_urls, highlights, enriched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (location_alias) DO UPDATE SET
       restaurant_name = EXCLUDED.restaurant_name,
       scraped_data = EXCLUDED.scraped_data,
       ai_analysis = EXCLUDED.ai_analysis,
       cuisine_type = COALESCE(EXCLUDED.cuisine_type, restaurant_profiles.cuisine_type),
       address = COALESCE(EXCLUDED.address, restaurant_profiles.address),
       phone = COALESCE(EXCLUDED.phone, restaurant_profiles.phone),
       website = COALESCE(EXCLUDED.website, restaurant_profiles.website),
       rating = COALESCE(EXCLUDED.rating, restaurant_profiles.rating),
       review_count = COALESCE(EXCLUDED.review_count, restaurant_profiles.review_count),
       price_level = COALESCE(EXCLUDED.price_level, restaurant_profiles.price_level),
       photo_urls = EXCLUDED.photo_urls,
       highlights = EXCLUDED.highlights,
       enriched_at = NOW()`,
    [
      alias,
      name,
      JSON.stringify(scrapedData),
      aiAnalysis,
      extracted.cuisineType,
      extracted.address,
      extracted.phone,
      extracted.website,
      extracted.rating,
      extracted.reviewCount,
      extracted.priceLevel,
      JSON.stringify(extracted.photoUrls),
      JSON.stringify(extracted.highlights),
    ]
  );
}

// ── Cache row → Profile response ──

function rowToProfile(
  row: Record<string, unknown>,
  tradingCtx?: { tradeCount: number; avgPriceCents: number; recentTrades: Array<{ date: string; priceCents: number }> }
): RestaurantProfile {
  return {
    locationAlias: row.location_alias as string,
    restaurantName: row.restaurant_name as string,
    cuisineType: (row.cuisine_type as string) ?? null,
    address: (row.address as string) ?? null,
    phone: (row.phone as string) ?? null,
    website: (row.website as string) ?? null,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count != null ? Number(row.review_count) : null,
    priceLevel: (row.price_level as string) ?? null,
    photoUrls: (row.photo_urls as string[]) ?? [],
    highlights: (row.highlights as string[]) ?? [],
    aiAnalysis: (row.ai_analysis as string) ?? null,
    scrapedData: (row.scraped_data as Record<string, unknown>) ?? {},
    enrichedAt: (row.enriched_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    tradingContext: tradingCtx,
  };
}
