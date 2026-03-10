import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import {
  hasDatabase,
  buildMemoryContext,
  startSession,
  completeSession,
} from "./db/index.js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

// ── AT API Tool Definitions for Claude Agent ──

const AT_TOOLS: Tool[] = [
  {
    name: "at_get_highest_converting",
    description:
      "Get the highest converting locations on AppointmentTrader — venues with the most demand for listings. Returns ranked locations with conversion rates.",
    input_schema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Results per page (default 25)" },
      },
      required: [],
    },
  },
  {
    name: "at_get_most_bids_least_asks",
    description:
      "Get locations with the highest bid-to-listing ratio — supply/demand imbalance indicating opportunities.",
    input_schema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Results per page (default 25)" },
      },
      required: [],
    },
  },
  {
    name: "at_get_underserved",
    description:
      "Get most underserved locations — high bids but few listings in the past 30 days.",
    input_schema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Results per page (default 25)" },
      },
      required: [],
    },
  },
  {
    name: "at_get_most_viewed_least_listings",
    description:
      "Get locations with high views but few listings — attention without supply.",
    input_schema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Results per page (default 25)" },
      },
      required: [],
    },
  },
  {
    name: "at_get_toplist",
    description: "Get top ranked locations by composite score.",
    input_schema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Results per page (default 25)" },
      },
      required: [],
    },
  },
  {
    name: "at_get_location_metrics",
    description:
      "Get 90-day trading metrics for a specific location. Requires locationAlias and date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Location slug (e.g. carbone-new-york)" },
        dateRangeStart: { type: "string", description: "Start date YYYY-MM-DD" },
        dateRangeEnd: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["locationAlias", "dateRangeStart", "dateRangeEnd"],
    },
  },
  {
    name: "at_get_comparable_trades",
    description:
      "Get comparable trade prices for a specific location, date/time, and inventory type. Returns average pricing and individual trade history.",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Location slug" },
        dateTime: { type: "string", description: "YYYY-MM-DD HH:MM:SS" },
        inventoryTypeID: { type: "number", description: "Inventory type ID (e.g. 2 for table-for-2)" },
      },
      required: ["locationAlias", "dateTime", "inventoryTypeID"],
    },
  },
  {
    name: "at_get_inventory_forecast",
    description:
      "Get predicted inventory needs based on historical data. PAID endpoint ($0.10/call). Returns what inventory is likely to sell, with YoY price trends.",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Location slug" },
        dateRangeStart: { type: "string", description: "Start date YYYY-MM-DD" },
        dateRangeEnd: { type: "string", description: "End date YYYY-MM-DD" },
        desiredProfitBasisPoints: { type: "number", description: "Profit target in basis points (10000 = 100%)" },
      },
      required: ["locationAlias", "dateRangeStart", "dateRangeEnd"],
    },
  },
  {
    name: "at_search_locations",
    description: "Search for locations on AppointmentTrader by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        searchFilter: { type: "string", description: "Search query" },
      },
      required: ["searchFilter"],
    },
  },
  {
    name: "at_get_inventory_types",
    description: "Get available inventory types for a location (e.g. Table for 2, Table for 4).",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Location slug" },
      },
      required: ["locationAlias"],
    },
  },
  {
    name: "at_get_portfolio",
    description: "Get all listings in the user's portfolio with popularity scores.",
    input_schema: {
      type: "object" as const,
      properties: {
        getPopularityScoreBracket: { type: "boolean", description: "Include popularity scores" },
      },
      required: [],
    },
  },
  {
    name: "at_get_competing_listings",
    description: "Get competing listings for a specific listing ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        listingID: { type: "string", description: "The listing ID to check competition for" },
      },
      required: ["listingID"],
    },
  },
  {
    name: "at_get_bids",
    description: "Get all available bids on the platform (5-minute reporting delay).",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Filter by location (optional)" },
        pageSize: { type: "number", description: "Results per page" },
      },
      required: [],
    },
  },
  {
    name: "at_parse_reservation_email",
    description:
      "Parse a forwarded reservation confirmation email into structured data (restaurant, date, time, party size, name, contact info).",
    input_schema: {
      type: "object" as const,
      properties: {
        emailSubject: { type: "string", description: "Email subject line" },
        emailBody: { type: "string", description: "Full email body text" },
      },
      required: ["emailBody"],
    },
  },
];

// ── Tool Executor ──

import { ATAPI } from "../src/api/index.js";

let _api: ATAPI | null = null;
function getAPI(): ATAPI {
  if (!_api) _api = new ATAPI();
  return _api;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const api = getAPI();

  try {
    switch (name) {
      case "at_get_highest_converting":
        return JSON.stringify(
          await api.marketdata.getHighestConvertingLocations({
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_get_most_bids_least_asks":
        return JSON.stringify(
          await api.marketdata.getMostBidsLeastAsks({
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_get_underserved":
        return JSON.stringify(
          await api.marketdata.getMostUnderservedLocations({
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_get_most_viewed_least_listings":
        return JSON.stringify(
          await api.marketdata.getMostViewedLeastListings({
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_get_toplist":
        return JSON.stringify(
          await api.marketdata.getToplist({
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_get_location_metrics":
        return JSON.stringify(
          await api.location.getMetrics(
            input.locationAlias as string,
            input.dateRangeStart as string,
            input.dateRangeEnd as string
          )
        );
      case "at_get_comparable_trades":
        return JSON.stringify(
          await api.location.getComparableTrades({
            locationAlias: input.locationAlias as string,
            dateTime: input.dateTime as string,
            inventoryTypeID: input.inventoryTypeID as number,
          })
        );
      case "at_get_inventory_forecast":
        return JSON.stringify(
          await api.marketdata.getRequiredInventoryForecast({
            locationAlias: input.locationAlias as string,
            dateRangeStart: input.dateRangeStart as string,
            dateRangeEnd: input.dateRangeEnd as string,
            desiredProfitBasisPoints: input.desiredProfitBasisPoints as number,
          })
        );
      case "at_search_locations":
        return JSON.stringify(
          await api.location.getList(input.searchFilter as string)
        );
      case "at_get_inventory_types":
        return JSON.stringify(
          await api.location.getInventoryTypes(input.locationAlias as string)
        );
      case "at_get_portfolio":
        return JSON.stringify(
          await api.portfolio.getListings({
            getPopularityScoreBracket: (input.getPopularityScoreBracket as boolean) ?? true,
          })
        );
      case "at_get_competing_listings":
        return JSON.stringify(
          await api.listing.getCompetingListings(input.listingID as string)
        );
      case "at_get_bids":
        return JSON.stringify(
          await api.bid.getList({
            locationAlias: input.locationAlias as string,
            pageSize: (input.pageSize as number) ?? 25,
          })
        );
      case "at_parse_reservation_email": {
        // This is handled by Claude itself — we just return the input for it to parse
        return JSON.stringify({
          instruction:
            "Parse this email and return structured reservation data as JSON with fields: restaurantName, date (YYYY-MM-DD), time (HH:MM 24hr), partySize, firstName, lastName, email, phone, confirmationNumber, specialNotes",
          subject: input.emailSubject ?? "",
          body: input.emailBody,
        });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Memory-Enhanced Tool Definitions ──
// These let the agent read/write its own memory during a session

const MEMORY_TOOLS: Tool[] = [
  {
    name: "memory_recall",
    description:
      "Recall what you know about a specific location from your memory. Returns historical trades, learned patterns, and past analyses. Use this BEFORE making pricing decisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        locationAlias: { type: "string", description: "Location slug to recall intel about" },
      },
      required: ["locationAlias"],
    },
  },
  {
    name: "memory_learn",
    description:
      "Store a durable insight or pattern you've discovered. Only store facts that would be useful across future sessions — not transient data. Categories: market_pattern, pricing_strategy, user_preference, operational.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "market_pattern | pricing_strategy | user_preference | operational" },
        fact: { type: "string", description: "The insight to remember" },
        confidence: { type: "number", description: "0.0-1.0 confidence level" },
      },
      required: ["category", "fact"],
    },
  },
];

// ── Agentic Loop (Memory-Integrated) ──

export interface AgentResult {
  text: string;
  toolCalls: Array<{ name: string; result: string }>;
  sessionId?: number;
}

export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTurns?: number;
    sessionType?: string;
    locationAlias?: string;
  } = {}
): Promise<AgentResult> {
  const { maxTurns = 10, sessionType = "freeform", locationAlias } = options;
  const startTime = Date.now();
  const anthropic = new Anthropic();

  // ── Inject memory context into system prompt ──
  let enrichedPrompt = systemPrompt;
  if (hasDatabase()) {
    try {
      const memoryContext = await buildMemoryContext(locationAlias);
      if (memoryContext) {
        enrichedPrompt = `${systemPrompt}\n\n${memoryContext}`;
      }
    } catch {
      // Memory is optional — continue without it
    }
  }

  // ── Start session log ──
  let sessionId: number | undefined;
  if (hasDatabase()) {
    try {
      sessionId = await startSession(sessionType, userMessage, systemPrompt);
    } catch {
      // Session logging is optional
    }
  }

  // Include memory tools if DB is available
  const tools = hasDatabase() ? [...AT_TOOLS, ...MEMORY_TOOLS] : AT_TOOLS;

  const messages: MessageParam[] = [{ role: "user", content: userMessage }];
  const toolCallLog: Array<{ name: string; result: string }> = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: enrichedPrompt,
      tools,
      messages,
    });

    totalTokensIn += response.usage?.input_tokens ?? 0;
    totalTokensOut += response.usage?.output_tokens ?? 0;

    // Collect text and tool use blocks
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      if (toolUseBlocks.length === 0) {
        const result = { text: textBlocks.join("\n"), toolCalls: toolCallLog, sessionId };
        await finalizeSession(sessionId, result, totalTokensIn, totalTokensOut, startTime);
        return result;
      }
    }

    // Execute tool calls
    if (toolUseBlocks.length > 0) {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const tool of toolUseBlocks) {
        const result = await executeToolWithMemory(tool.name, tool.input, sessionId);
        toolCallLog.push({ name: tool.name, result: result.substring(0, 200) + "..." });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (response.stop_reason === "end_turn" && textBlocks.length > 0) {
      const result = { text: textBlocks.join("\n"), toolCalls: toolCallLog, sessionId };
      await finalizeSession(sessionId, result, totalTokensIn, totalTokensOut, startTime);
      return result;
    }
  }

  const result = { text: "Agent reached maximum turns without completing.", toolCalls: toolCallLog, sessionId };
  await finalizeSession(sessionId, result, totalTokensIn, totalTokensOut, startTime, "partial");
  return result;
}

/** Execute a tool — handles both AT API tools and memory tools */
async function executeToolWithMemory(
  name: string,
  input: Record<string, unknown>,
  sessionId?: number
): Promise<string> {
  // Handle memory tools
  if (name === "memory_recall" && hasDatabase()) {
    const { getLocationIntelligence, getActiveMemory } = await import("./db/index.js");
    const alias = input.locationAlias as string;
    const intel = await getLocationIntelligence(alias);
    const memories = await getActiveMemory();
    const relevant = memories.filter(
      (m) => m.fact.toLowerCase().includes(alias.toLowerCase())
    );
    return JSON.stringify({ locationIntel: intel, relevantMemories: relevant });
  }

  if (name === "memory_learn" && hasDatabase()) {
    const { learnFact } = await import("./db/index.js");
    const id = await learnFact(
      input.category as string,
      input.fact as string,
      (input.confidence as number) ?? 0.5,
      sessionId
    );
    return JSON.stringify({ stored: true, factId: id });
  }

  // Delegate to AT API tool executor
  return executeTool(name, input);
}

/** Finalize session logging */
async function finalizeSession(
  sessionId: number | undefined,
  result: AgentResult,
  tokensIn: number,
  tokensOut: number,
  startTime: number,
  outcome: "success" | "error" | "partial" = "success"
): Promise<void> {
  if (!sessionId || !hasDatabase()) return;
  try {
    await completeSession(sessionId, {
      agentResponse: result.text,
      toolCalls: result.toolCalls,
      tokensIn,
      tokensOut,
      durationMs: Date.now() - startTime,
      outcome,
    });
  } catch {
    // Session logging is optional — don't break the agent
  }
}

export { AT_TOOLS };
