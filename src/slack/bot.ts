import dotenv from "dotenv";
import { App } from "@slack/bolt";
import { queryRAG } from "../retrieval/rag.js";

dotenv.config();

// Global reference to the Slack Bolt App instance, allowing us to control its startup/shutdown
let app: any = null;

/**
 * Initializes and starts the Slack Bot in Socket Mode.
 * It reads environment variables, sets up mention listeners and slash commands,
 * and starts the Socket Mode connection loop.
 */
export async function startSlackBot() {
  const token = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // Gracefully skip bot initialization if Slack tokens are not defined in the environment.
  // This allows the local server to run other features (like CLI/Ingestion) without crashing.
  if (!token || !appToken) {
    console.warn("Slack Bot: SLACK_BOT_TOKEN or SLACK_APP_TOKEN is missing. Slack bot is disabled.");
    return;
  }

  console.log("Slack Bot: Initializing Bolt App...");
  
  // Create the Slack App instance.
  // Socket Mode listens for Slack events over a WebSocket connection, eliminating the need for public URL tunnels (like ngrok).
  app = new App({
    token,
    appToken,
    signingSecret: signingSecret || "dummy_secret",
    socketMode: true,
  });

  /**
   * Listen for bot mentions in channels (e.g. "@OnboardBot where does auth happen?").
   */
  app.event("app_mention", async ({ event, say }: any) => {
    try {
      const rawText = event.text || "";
      // Strip out the bot user ID pattern (e.g. <@U12345678>) to isolate the user's actual question text
      const question = rawText.replace(/<@U[A-Z0-9]+>/g, "").trim();

      // If mention is empty, reply with a prompt message
      if (!question) {
        await say("Hi! Ask me a question about the repository or documentation.");
        return;
      }

      console.log(`Slack Bot: Received question: "${question}"`);

      // Run query through the shared hybrid RAG pipeline (semantic + keyword + LLM reranking)
      const result = await queryRAG(question);

      // Map each document source to a Slack markdown list item, displaying its source type in brackets
      const sourceList = result.sources
        .map((s) => `\`[${s.source_type || "code"}]\` ${s.file_path}`)
        .join("\n");

      // Respond back to Slack channel using Slack Block Kit UI blocks for visual hierarchy
      await say({
        blocks: [
          // Section block: houses the main LLM-generated answer text
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: result.answer,
            },
          },
          // Context block: displays citations in a muted format at the bottom
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*Sources:*\n${sourceList || "_No sources cited._"}`,
              },
            ],
          },
        ],
      });
    } catch (error: any) {
      console.error("Slack Bot error handling app_mention:", error);
      await say(`Sorry, I encountered an error while processing your request: ${error.message}`);
    }
  });

  /**
   * Listen for the /onboard slash command (e.g., "/onboard @username role:backend").
   * Triggers onboarding day-1 guide generation.
   */
  app.command("/onboard", async ({ ack, respond }: any) => {
    try {
      // CRITICAL: Acknowledge the slash command request immediately within Slack's 3-second timeout window.
      // Failing to do so causes Slack to display an error ("dispatch failed") to the user.
      await ack();

      // Respond asynchronously using the ephemeral response method
      await respond({
        text: "Guide coming in week 4",
        response_type: "ephemeral",
      });
    } catch (error) {
      console.error("Slack Bot error handling /onboard command:", error);
    }
  });

  // Connect the app to Slack's gateway and begin listening
  await app.start();
  console.log("Slack Bot: Live and listening via Socket Mode.");
}

/**
 * Cleanly shuts down the Slack Bot connection.
 * Used during server shutdown to close WebSocket connections safely.
 */
export async function stopSlackBot() {
  if (app) {
    try {
      await app.stop();
      console.log("Slack Bot: Connection stopped.");
    } catch (err) {
      console.error("Slack Bot: Error during shutdown:", err);
    }
  }
}
