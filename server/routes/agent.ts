import { Router } from "express";
import { runAgent } from "../agent.js";

export const agentRoutes = Router();

// POST /api/agent/chat — Freeform agent chat with AT API tools
agentRoutes.post("/chat", async (req, res) => {
  const { message, context } = req.body;

  if (!message) {
    return res.status(400).json({
      RequestStatus: "Failed",
      ResponseMessage: "message is required",
    });
  }

  try {
    const result = await runAgent(
      `You are AT Edge, an intelligent assistant for AppointmentTrader sellers. You have access to real-time market data, portfolio management, and pricing tools.

Help the user with their request. Be concise and actionable. Use your tools when you need real data — don't guess.

${context ? `Context: ${context}` : ""}`,
      message,
    );

    res.json({
      RequestStatus: "Succeeded",
      ResponseCode: 100,
      Payload: {
        response: result.text,
        toolCalls: result.toolCalls,
      },
    });
  } catch (err) {
    res.status(500).json({
      RequestStatus: "Failed",
      ResponseMessage: err instanceof Error ? err.message : String(err),
    });
  }
});
