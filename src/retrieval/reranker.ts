import crypto from "crypto";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

type Candidate = { id: number; file_path: string; text: string };

const cache = new Map<string, any>();

function hashQuery(query: string, candidateIds: number[]) {
  const h = crypto.createHash("sha256");
  h.update(query);
  h.update(candidateIds.join(","));
  return h.digest("hex");
}

export async function rerank(
  query: string,
  candidates: Candidate[],
  topK = 5,
): Promise<Candidate[]> {
  const key = hashQuery(
    query,
    candidates.map((c) => c.id),
  );
  if (cache.has(key)) return cache.get(key);

  // Default simple reranker: call OpenAI to score relevance 0-10 for each candidate.
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    // fallback: return first topK
    const out = candidates.slice(0, topK);
    cache.set(key, out);
    return out;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const promptParts = candidates.slice(0, 20).map((c, i) => {
    return `Candidate ${i + 1} -- file: ${c.file_path}\n${c.text.slice(0, 500)}`;
  });

  const system = `You are a reranker. Given a query, score each candidate 0-10 for relevance. Return a JSON array of objects: {index: number, score: number}. Only output JSON.`;
  const user = `Query: ${query}\n\nCandidates:\n${promptParts.join("\n\n")}`;

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
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) scores = parsed;
  } catch (e) {
    // parsing failed -> fallback
    const fallback = candidates.slice(0, topK);
    cache.set(key, fallback);
    return fallback;
  }

  const scored = candidates
    .map((c, i) => {
      const s = scores.find((x) => x.index === i + 1)?.score ?? 0;
      return { c, score: s };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.c);

  cache.set(key, scored);
  return scored;
}
