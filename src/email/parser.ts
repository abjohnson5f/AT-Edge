import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { ParsedReservation } from "../api/types.js";

const PARSE_PROMPT = `You are a reservation email parser. Extract reservation details from the forwarded confirmation email below.

Return ONLY a JSON object with these fields:
- restaurantName: string (the venue/restaurant name)
- date: string (YYYY-MM-DD format)
- time: string (HH:MM in 24-hour format)
- partySize: number (number of guests/covers)
- firstName: string (first name on reservation)
- lastName: string (last name on reservation)
- email: string (email associated with reservation, or empty string)
- phone: string (phone number with country code, or empty string)
- confirmationNumber: string (confirmation/booking reference, or empty string)
- specialNotes: string (any special requests, seating preferences, etc., or empty string)

If a field cannot be determined, use reasonable defaults:
- partySize defaults to 2
- email/phone: use empty string if not found
- time: convert to 24-hour format

IMPORTANT: Parse the ACTUAL reservation details, not any forwarding metadata. The user forwarded this email — extract the original reservation confirmation data.

Return ONLY valid JSON, no markdown fencing, no explanation.`;

export async function parseReservationEmail(
  emailBody: string,
  emailSubject: string
): Promise<ParsedReservation> {
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${PARSE_PROMPT}\n\nSubject: ${emailSubject}\n\nEmail Body:\n${emailBody}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown fencing if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  const parsed = JSON.parse(cleaned) as Omit<ParsedReservation, "rawSource">;

  return {
    ...parsed,
    rawSource: `Subject: ${emailSubject}\n\n${emailBody}`,
  };
}
