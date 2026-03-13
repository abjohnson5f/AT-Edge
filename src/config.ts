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
    user: process.env.GMAIL_USER ?? "",
    appPassword: process.env.GMAIL_APP_PASSWORD ?? "",
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
