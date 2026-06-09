import crypto from "crypto";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

/**
 * Represents a document candidate passed to the reranking engine.
 */
type Candidate = { id: number; file_path: string; text: string; source_type?: string };

// In-memory cache to store previously computed reranking results
const cache = new Map<string, any>();

/**
 * Creates a unique SHA-256 hash using the search query and the ordered list of candidate document IDs.
 * This serves as a cache key to avoid duplicate LLM reranker calls.
 * 
 * @param query The user's query string.
 * @param candidateIds List of document IDs being evaluated.
 * @returns A hex SHA-256 string.
 */
function hashQuery(query: string, candidateIds: number[]) {
  const h = crypto.createHash("sha256");
  h.update(query);
  h.update(candidateIds.join(","));
  return h.digest("hex");
}

/**
 * Reranks the candidate documents using an LLM to evaluate actual semantic relevance.
 * Takes the top 20 candidate documents and narrows them down to the top K (default 5).
 * 
 * @param query The user's query string.
 * @param candidates List of retrieved document candidates.
 * @param topK The maximum number of reranked candidates to return.
 * @returns A promise resolving to the top K sorted candidates.
 */
export async function rerank(
  query: string,
  candidates: Candidate[],
  topK = 5,
): Promise<Candidate[]> {
  // Generate a cache key for the query and document IDs combination
  const key = hashQuery(
    query,
    candidates.map((c) => c.id),
  );
  
  // Return cached result if present to bypass LLM latency and cost
  if (cache.has(key)) return cache.get(key);

  // Fallback check: if OpenAI API Key is not set, return the first topK documents as-is
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    const out = candidates.slice(0, topK);
    cache.set(key, out);
    return out;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Format the top 20 candidate document chunks into descriptive text block prompts
  const promptParts = candidates.slice(0, 20).map((c, i) => {
    return `Candidate ${i + 1} -- file: ${c.file_path}\n${c.text.slice(0, 500)}`;
  });

  // Prompt instructions: guide the model to output a structured JSON array containing candidate indexes and scores
  const system = `You are a reranker. Given a query, score each candidate 0-10 for relevance. Return a JSON array of objects: {index: number, score: number}. Only output JSON.`;
  const user = `Query: ${query}\n\nCandidates:\n${promptParts.join("\n\n")}`;

  // Call the OpenAI chat completions API using the fast, cost-efficient gpt-4o-mini model
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 300,
  });

  const text = resp.choices?.[0]?.message?.content || "";
  let scores: { index: number; score: number }[] = [];
  
  // Parse the structured JSON response
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) scores = parsed;
  } catch (e) {
    // If parsing fails (e.g. LLM returned malformed text), fall back to original topK order
    const fallback = candidates.slice(0, topK);
    cache.set(key, fallback);
    return fallback;
  }

  // Map the LLM scores back to the candidate document objects, sort descending, and take top K
  const scored = candidates
    .map((c, i) => {
      const s = scores.find((x) => x.index === i + 1)?.score ?? 0;
      return { c, score: s };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.c);

  // Store the sorted candidates in the cache and return
  cache.set(key, scored);
  return scored;
}

