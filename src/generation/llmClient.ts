import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function generateAnswer(
  messages: { role: string; content: string }[],
  onToken?: (s: string) => void,
) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 800,
    temperature: 0.0,
  });

  const out = resp.choices?.[0]?.message?.content || "";
  if (onToken) {
    // crude token streaming: split by spaces
    out.split(/(\s+)/).forEach((tok) => onToken(tok));
  }
  return out;
}
