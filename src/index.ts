import dotenv from "dotenv";
// @ts-ignore
import cron from "node-cron";
import { startSlackBot } from "./slack/bot.js";
import { runIngestion } from "./ingestion/index.js";

dotenv.config();

async function bootstrap() {
  console.log("=== Engineering Onboarding Copilot Server Starting ===");
  console.log("Environment info:");
  console.log({
    NODE_ENV: process.env.NODE_ENV ?? "development",
    GITHUB_OWNER: process.env.GITHUB_OWNER ?? "undefined",
    GITHUB_REPO: process.env.GITHUB_REPO ?? "undefined",
    GITHUB_BRANCH: process.env.GITHUB_BRANCH ?? "main",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "undefined",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "set" : "undefined",
  });

  // 1. Start the Slack Bot
  try {
    await startSlackBot();
  } catch (err: any) {
    console.error("Failed to start Slack Bot:", err.message);
  }

  // 2. Schedule Daily Ingestion Cron Job (at midnight: 0 0 * * *)
  console.log("Scheduler: Setting up daily ingestion cron job at midnight...");
  cron.schedule("0 0 * * *", async () => {
    console.log("Cron Job: Triggering scheduled daily repository ingestion...");
    try {
      await runIngestion();
      console.log("Cron Job: Daily repository ingestion completed successfully.");
    } catch (err: any) {
      console.error("Cron Job: Scheduled ingestion encountered an error:", err.message);
    }
  });

  console.log("=== Copilot Server Startup Complete ===");
}

bootstrap().catch((error) => {
  console.error("Startup bootstrap failed:", error);
  process.exit(1);
});
