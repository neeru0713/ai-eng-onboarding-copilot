import dotenv from "dotenv";
import { App } from "@slack/bolt";
import { queryRAG } from "../retrieval/rag.js";
import { generateGuide } from "../guides/generateGuide.js";
import { saveAnswer, logFeedback } from "../feedback/logger.js";

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
      const repo = process.env.GITHUB_REPO || "unknown-repo";
      const result = await queryRAG(question, undefined, repo);

      // Map each document source to a Slack markdown list item, displaying its source type in brackets
      const sourceList = result.sources
        .map((s: any) => `\`[${s.source_type || "code"}]\` ${s.file_path}`)
        .join("\n");

      // Respond back to Slack channel using Slack Block Kit UI blocks for visual hierarchy
      const response = await say({
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

      // Save to SQLite DB for reaction-based feedback logging
      if (response && response.ts) {
        saveAnswer(response.channel || event.channel, response.ts, question, result.answer);
      }
    } catch (error: any) {
      console.error("Slack Bot error handling app_mention:", error);
      await say(`Sorry, I encountered an error while processing your request: ${error.message}`);
    }
  });

  /**
   * Listen for the /onboard slash command (e.g., "/onboard @username role:backend").
   * Triggers onboarding day-1 guide generation.
   */
  app.command("/onboard", async ({ command, ack, respond, client }: any) => {
    try {
      // CRITICAL: Acknowledge the slash command request immediately within Slack's 3-second timeout window.
      // Failing to do so causes Slack to display an error ("dispatch failed") to the user.
      await ack();

      const textStr = (command.text || "").trim();
      const match = textStr.match(/<@([A-Z0-9]+)>/); // extract first user mention
      const roleMatch = textStr.match(/role:(\S+)/); // extract role
      
      if (!match || !roleMatch) {
        await respond({
          text: "Usage: `/onboard @username role:role_name` (e.g. `/onboard @username role:frontend`)",
          response_type: "ephemeral",
        });
        return;
      }

      const targetUserId = match[1];
      const role = roleMatch[1];

      // Respond asynchronously using the ephemeral response method to confirm receipt
      await respond({
        text: `Generating onboarding guide for <@${targetUserId}> (role: ${role}). This will be sent directly to them as a DM.`,
        response_type: "ephemeral",
      });

      // Run guide generation asynchronously
      (async () => {
        try {
          const repo = process.env.GITHUB_REPO || "unknown-repo";
          const guide = await generateGuide(repo, role);
          
          // Send guide to target user as DM
          await client.chat.postMessage({
            channel: targetUserId,
            text: guide,
          });
          console.log(`Successfully generated and sent Day-1 guide to ${targetUserId}`);
        } catch (err: any) {
          console.error("Failed to generate and send onboarding guide:", err.message);
          try {
            await client.chat.postEphemeral({
              channel: command.channel_id,
              user: command.user_id,
              text: `Failed to generate onboarding guide for <@${targetUserId}>: ${err.message}`,
            });
          } catch (e) {
            // ignore
          }
        }
      })();

    } catch (error) {
      console.error("Slack Bot error handling /onboard command:", error);
    }
  });

  /**
   * Listen for reaction_added events to log user feedback
   */
  app.event("reaction_added", async ({ event }: any) => {
    try {
      const { item, reaction } = event;
      if (item && item.type === "message") {
        logFeedback(item.channel, item.ts, reaction);
      }
    } catch (error) {
      console.error("Slack Bot error handling reaction_added event:", error);
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
