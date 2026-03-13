import Anthropic from "@anthropic-ai/sdk";
import { ATAPI } from "../api/index.js";
import { config } from "../config.js";
import { fetchEmailsSince } from "../email/gmail.js";
import type { RawEmail } from "../email/gmail.js";
import { parseReservationEmail } from "../email/parser.js";
import type { ParsedReservation } from "../api/types.js";

interface ImportResult {
  emailId: string;
  subject: string;
  parsed: ParsedReservation;
  locationMatch: { alias: string; name: string } | null;
  pricingAdvice: string;
  listingResult: unknown;
  status: "created" | "dry_run" | "no_match" | "error";
  error?: string;
}

const PRICING_PROMPT = `You are a pricing advisor for AppointmentTrader listings.

Given a parsed reservation and comparable trade data, recommend an optimal listing price.

Consider:
- Average comparable trade price
- Day of week and time (weekend/prime time = premium)
- Party size (larger parties often command higher prices)
- How far out the reservation is (closer dates = more urgency premium)

Return a JSON object:
{
  "recommendedPriceCents": number,
  "priceRangeMinCents": number,
  "priceRangeMaxCents": number,
  "reasoning": "brief explanation"
}

Return ONLY valid JSON, no markdown fencing.`;

export async function runImporter(options: {
  execute?: boolean;
  skipGmail?: boolean;
  manualEmail?: { subject: string; body: string };
} = {}) {
  const api = new ATAPI();
  const execute = options.execute ?? !config.agent.dryRun;
  const results: ImportResult[] = [];

  // Get emails to process
  let emails: Array<{ id: string; subject: string; body: string }>;

  if (options.manualEmail) {
    emails = [
      {
        id: "manual",
        subject: options.manualEmail.subject,
        body: options.manualEmail.body,
      },
    ];
  } else if (options.skipGmail) {
    console.log("  Gmail skipped. Use --manual to paste an email.\n");
    return [];
  } else {
    console.log("  Checking Gmail for recent reservation emails (last 48h)...\n");
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const gmailMessages = await fetchEmailsSince(since);

    if (gmailMessages.length === 0) {
      console.log("  No new emails found.\n");
      return [];
    }

    console.log(`  Found ${gmailMessages.length} email(s) to process.\n`);
    emails = gmailMessages.map((m: RawEmail) => ({
      id: String(m.uid),
      subject: m.subject,
      body: m.body,
    }));
  }

  for (const email of emails) {
    console.log(`  Processing: "${email.subject}"`);

    try {
      // Step 1: Parse the reservation email
      const parsed = await parseReservationEmail(email.body, email.subject);
      console.log(
        `    Parsed: ${parsed.restaurantName} | ${parsed.date} ${parsed.time} | Party of ${parsed.partySize}`
      );

      // Step 2: Find the location on AT
      const locationSearch = await api.location.getList(
        parsed.restaurantName.toLowerCase().replace(/[^a-z0-9\s]/g, ""),
        { pageSize: 5 }
      );

      const locations = (locationSearch.Payload as any)?.KeyValueList ?? locationSearch.Payload;
      const locationMatch = Array.isArray(locations) && locations.length > 0
        ? locations[0]
        : null;

      if (!locationMatch) {
        console.log(
          `    No AT location found for "${parsed.restaurantName}". You may need to create it.`
        );
        results.push({
          emailId: email.id,
          subject: email.subject,
          parsed,
          locationMatch: null,
          pricingAdvice: "",
          listingResult: null,
          status: "no_match",
        });
        continue;
      }

      const alias = locationMatch.locationAlias ?? locationMatch.alias ?? Object.values(locationMatch)[0];
      console.log(`    AT Location matched: ${alias}`);

      // Step 3: Get inventory types for the location
      const inventoryTypes = await api.location.getInventoryTypes(alias);
      const inventoryPayload = inventoryTypes.Payload as any;
      const types = Array.isArray(inventoryPayload)
        ? inventoryPayload
        : inventoryPayload?.KeyValueList ?? [];

      // Try to match party size to inventory type (e.g., "Table for 2")
      let inventoryTypeID = 2; // default to 2 (common for table-for-2)
      if (Array.isArray(types)) {
        const match = types.find((t: any) => {
          const name = (t.inventoryTypeName ?? t.name ?? "").toLowerCase();
          return name.includes(String(parsed.partySize));
        });
        if (match) {
          inventoryTypeID = match.inventoryTypeID ?? match.id ?? inventoryTypeID;
        }
      }

      // Step 4: Get comparable trades for pricing
      const dateTime = `${parsed.date} ${parsed.time}:00`;
      let comparables: any = null;
      try {
        const compResult = await api.location.getComparableTrades({
          locationAlias: alias,
          dateTime,
          inventoryTypeID,
        });
        comparables = compResult.Payload;
      } catch {
        console.log("    No comparable trades available. Using default pricing.");
      }

      // Step 5: Get AI pricing recommendation
      const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      const pricingResponse = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `${PRICING_PROMPT}\n\nReservation:\n${JSON.stringify(parsed, null, 2)}\n\nComparable Trades:\n${JSON.stringify(comparables, null, 2)}`,
          },
        ],
      });

      const pricingText =
        pricingResponse.content[0].type === "text"
          ? pricingResponse.content[0].text
          : "{}";
      const pricingCleaned = pricingText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      const pricing = JSON.parse(pricingCleaned);

      console.log(
        `    Recommended price: $${(pricing.recommendedPriceCents / 100).toFixed(2)} (range: $${(pricing.priceRangeMinCents / 100).toFixed(2)}-$${(pricing.priceRangeMaxCents / 100).toFixed(2)})`
      );
      console.log(`    Reasoning: ${pricing.reasoning}`);

      // Step 6: Get required category fields
      let categoryFields: Array<{ fieldID: string; fieldValue: string }> = [];
      try {
        const categoryResult = await api.location.getCategory(alias);
        // Category fields will vary by location — for now use empty array
        // In production, this would map parsed data to required fields
      } catch {
        // Category lookup failed — proceed with empty fields
      }

      // Step 7: Create the listing (dry-run first, then execute if enabled)
      const listingParams = {
        locationAlias: alias,
        inventoryTypeID,
        priceAmountInSmallestUnit: pricing.recommendedPriceCents,
        currencyCode: "USD",
        dateTime,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        emailAddress: parsed.email,
        phoneNumber: parsed.phone,
        locationCategoryFieldIDValueList: categoryFields,
      };

      // Always do a dry run first
      const dryRun = await api.location.setListing(listingParams, false);
      console.log(`    Dry run: ${dryRun.RequestStatus}`);

      let listingResult = dryRun;
      let status: ImportResult["status"] = "dry_run";

      if (execute) {
        listingResult = await api.location.setListing(listingParams, true);
        status = "created";
        console.log(
          `    LISTING CREATED: ${listingResult.Payload}`
        );
      } else {
        console.log(
          `    Dry run only. Run with --execute to create the listing.`
        );
      }

      // Step 8: Note processed (dedup handled by body hash in DB via server/email-scanner.ts)
      if (email.id !== "manual") {
        console.log("    Email processed.\n");
      }

      results.push({
        emailId: email.id,
        subject: email.subject,
        parsed,
        locationMatch: { alias, name: parsed.restaurantName },
        pricingAdvice: pricing.reasoning,
        listingResult: listingResult.Payload,
        status,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`    ERROR: ${errorMsg}\n`);
      results.push({
        emailId: email.id,
        subject: email.subject,
        parsed: {} as ParsedReservation,
        locationMatch: null,
        pricingAdvice: "",
        listingResult: null,
        status: "error",
        error: errorMsg,
      });
    }
  }

  return results;
}
