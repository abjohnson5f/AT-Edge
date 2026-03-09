import { config } from "./config.js";
import { runScout } from "./agents/scout.js";
import { runImporter } from "./agents/importer.js";
import { runPortfolioReview } from "./agents/portfolio.js";
import { ATAPI } from "./api/index.js";
import * as readline from "readline";

const COMMANDS = {
  scout: "Run market intelligence scan",
  import: "Check Gmail and import forwarded reservations",
  portfolio: "Review and optimize your current listings",
  "price-check": "Check pricing for a specific location + date",
  status: "Show account status and balances",
  help: "Show this help message",
};

async function main() {
  const command = process.argv[2] ?? "help";
  const flags = process.argv.slice(3);
  const execute = flags.includes("--execute");

  console.log(`\n  AT Edge v0.1.0`);
  console.log(`  Mode: ${config.agent.dryRun ? "DRY RUN" : "LIVE"}\n`);

  switch (command) {
    case "scout": {
      const result = await runScout({
        pageSize: Number(flags.find((f) => f.startsWith("--size="))?.split("=")[1] ?? 50),
      });
      console.log("\n" + result.report);
      break;
    }

    case "import": {
      if (flags.includes("--manual")) {
        // Interactive manual email paste mode
        const emailText = await promptMultiline(
          "Paste the reservation confirmation email (press Enter twice to finish):"
        );
        const results = await runImporter({
          execute,
          manualEmail: {
            subject: "Manual Import",
            body: emailText,
          },
        });
        printImportSummary(results);
      } else {
        const results = await runImporter({ execute });
        printImportSummary(results);
      }
      break;
    }

    case "portfolio": {
      const result = await runPortfolioReview();
      console.log("\n" + result.report);
      break;
    }

    case "price-check": {
      const locationAlias = flags[0];
      const dateTime = flags[1]; // YYYY-MM-DD HH:MM:SS
      const inventoryTypeID = Number(flags[2] ?? 2);

      if (!locationAlias || !dateTime) {
        console.log(
          "  Usage: npm run price-check <locationAlias> <YYYY-MM-DD HH:MM:SS> [inventoryTypeID]"
        );
        console.log(
          '  Example: npm run price-check carbone-new-york "2026-04-15 19:00:00" 2'
        );
        break;
      }

      const api = new ATAPI();
      const [comps, inventory, metrics] = await Promise.all([
        api.location.getComparableTrades({
          locationAlias,
          dateTime,
          inventoryTypeID,
        }),
        api.location.getInventoryTypes(locationAlias),
        api.location.getMetrics(
          locationAlias,
          getDateNDaysAgo(90),
          getTodayISO()
        ),
      ]);

      console.log("\n  Comparable Trades:");
      console.log(JSON.stringify(comps.Payload, null, 2));
      console.log("\n  Inventory Types:");
      console.log(JSON.stringify(inventory.Payload, null, 2));
      console.log("\n  90-Day Metrics:");
      console.log(JSON.stringify(metrics.Payload, null, 2));
      break;
    }

    case "status": {
      const api = new ATAPI();
      const [accounts, userDetails] = await Promise.all([
        api.account.getList(),
        api.account.getUserDetails(),
      ]);
      console.log("\n  Account Details:");
      console.log(JSON.stringify(userDetails.Payload, null, 2));
      console.log("\n  Accounts & Balances:");
      console.log(JSON.stringify(accounts.Payload, null, 2));
      break;
    }

    case "help":
    default: {
      console.log("  Commands:\n");
      for (const [cmd, desc] of Object.entries(COMMANDS)) {
        console.log(`    npm run ${cmd.padEnd(16)} ${desc}`);
      }
      console.log("\n  Flags:\n");
      console.log("    --execute       Execute write operations (default: dry run)");
      console.log("    --manual        Paste email text manually (for import)");
      console.log("    --size=N        Number of results for scout scan");
      console.log("");
      break;
    }
  }
}

function printImportSummary(results: any[]) {
  if (!results.length) return;

  console.log("\n  Import Summary:");
  console.log("  " + "─".repeat(60));

  for (const r of results) {
    const statusIcon =
      r.status === "created"
        ? "[CREATED]"
        : r.status === "dry_run"
          ? "[DRY RUN]"
          : r.status === "no_match"
            ? "[NO MATCH]"
            : "[ERROR]";

    console.log(`  ${statusIcon} ${r.subject}`);
    if (r.parsed?.restaurantName) {
      console.log(
        `           ${r.parsed.restaurantName} | ${r.parsed.date} ${r.parsed.time} | Party of ${r.parsed.partySize}`
      );
    }
    if (r.locationMatch) {
      console.log(`           AT Location: ${r.locationMatch.alias}`);
    }
    if (r.error) {
      console.log(`           Error: ${r.error}`);
    }
  }
  console.log("");
}

function promptMultiline(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`\n  ${prompt}\n`);

    const lines: string[] = [];
    let emptyCount = 0;

    rl.on("line", (line) => {
      if (line === "") {
        emptyCount++;
        if (emptyCount >= 2) {
          rl.close();
          resolve(lines.join("\n"));
          return;
        }
      } else {
        emptyCount = 0;
      }
      lines.push(line);
    });
  });
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

main().catch((err) => {
  console.error("\n  Fatal error:", err.message ?? err);
  process.exit(1);
});
