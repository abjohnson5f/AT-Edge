import dotenv from "dotenv";
dotenv.config();

export const config = {
  at: {
    apiKey: process.env.AT_API_KEY ?? "",
    baseUrl: "https://appointmenttrader.com/v1",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: "claude-sonnet-4-20250514",
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID ?? "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN ?? "",
    importLabel: process.env.GMAIL_IMPORT_LABEL ?? "AT-Import",
    processedLabel: "AT-Processed",
  },
  db: {
    url: process.env.DATABASE_URL ?? "",
  },
  agent: {
    dryRun: process.env.DRY_RUN !== "false",
    autoApproveBelowUsd: Number(process.env.AUTO_APPROVE_BELOW_USD ?? 0),
    defaultProfitBasisPoints: Number(
      process.env.DEFAULT_PROFIT_BASIS_POINTS ?? 10000
    ),
  },
} as const;

export function requireConfig(key: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${key}. Check your .env file.`);
  }
  return value;
}
