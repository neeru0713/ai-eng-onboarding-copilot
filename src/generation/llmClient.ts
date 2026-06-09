import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Interface client wrapper to generate answers using the OpenAI Chat Completions API.
 * It sends user and system prompt structures to the LLM and processes the output.
 * 
 * @param messages An array of chat message objects (system instructions, user queries, etc.).
 * @param onToken Optional callback function to simulate streamed token output.
 * @returns A promise resolving to the complete generated text answer.
 */
export async function generateAnswer(
  messages: any[],
  onToken?: (s: string) => void,
) {
  // Assert that OpenAI API credentials are set
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  // Create an OpenAI API client instance
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Call the OpenAI chat completion endpoint using gpt-4o-mini
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini", // Cost-efficient, high-speed mini model
    messages,
    max_tokens: 800,      // Limits the maximum output length of the response
    temperature: 0.0,     // Low temperature (0.0) ensures highly deterministic, factual answers
  });

  // Extract the text content of the message from the first choices array
  const out = resp.choices?.[0]?.message?.content || "";
  
  // If an onToken callback is provided, simulate token-by-token streaming
  if (onToken) {
    // Crude token streaming: splits the completed answer text by spaces/whitespace blocks
    // and sends each text segment sequentially to the token handler callback
    out.split(/(\s+)/).forEach((tok) => onToken(tok));
  }
  
  return out;
}
