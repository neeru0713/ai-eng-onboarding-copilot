import { vectorSearch } from "./vectorSearch.js";
import { BM25Search } from "./bm25Search.js";
import { rerank } from "./reranker.js";
import { buildPrompt } from "../generation/promptBuilder.js";
import { generateAnswer } from "../generation/llmClient.js";
import { LRUCache } from "lru-cache";
import crypto from "crypto";
import fs from "fs";
import path from "path";

let bm25Instance: BM25Search | null = null;

// Initialize the LRU cache with 24 hours TTL
const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
});

let totalQueries = 0;
let cacheHits = 0;

/**
 * Returns cache stats (total, hits, and rate) for logging/reporting
 */
export function getCacheStats() {
  return {
    totalQueries,
    cacheHits,
    hitRate: totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0,
  };
}

/**
 * Reset cache stats for testing/evaluation purposes
 */
export function resetCacheStats() {
  totalQueries = 0;
  cacheHits = 0;
  cache.clear();
}

/**
 * Computes SHA-256 hash of query + repo to use as cache key
 */
function getCacheKey(query: string, repo: string): string {
  return crypto.createHash("sha256").update(`${query}:${repo}`).digest("hex");
}

/**
 * Appends the latency metric to the JSONL log file
 */
function logLatency(data: { query: string; latencyMs: number; cacheHit: boolean; retrievedChunks: string[] }) {
  try {
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, "rag-latency.jsonl");
    const entry = JSON.stringify({
      query: data.query,
      latencyMs: data.latencyMs,
      cacheHit: data.cacheHit,
      retrievedChunks: data.retrievedChunks,
    }) + "\n";
    fs.appendFileSync(logPath, entry);
  } catch (err: any) {
    console.error("Failed to write latency log:", err.message);
  }
}

/**
 * Gets or initializes the singleton instance of BM25Search.
 * This prevents reloading all documents from PostgreSQL on every query.
 */
export async function getBM25(): Promise<BM25Search> {
  if (!bm25Instance) {
    bm25Instance = new BM25Search();
    try {
      await bm25Instance.initFromPostgres();
      bm25Instance.index();
      console.log("RAG Pipeline: BM25 singleton index ready.");
    } catch (e: any) {
      console.warn("RAG Pipeline: BM25 init failed:", e.message);
    }
  }
  return bm25Instance;
}

/**
 * Orchestrates the full Retrieval-Augmented Generation pipeline:
 * 1. Executes Vector Search & BM25 Search.
 * 2. Merges results via Rank Fusion (60% Vector, 40% BM25).
 * 3. Reranks the top 20 documents to top 5 using an LLM.
 * 4. Generates a final answer using the top 5 chunks as context.
 * 
 * @param query The user's question.
 * @param onToken Optional callback function to simulate streamed token output.
 * @param repo Optional repository filter.
 * @returns An object containing the generated answer and the source chunks used.
 */
export async function queryRAG(query: string, onToken?: (tok: string) => void, repo?: string) {
  const startTime = Date.now();
  const activeRepo = repo || process.env.GITHUB_REPO || "unknown-repo";
  const cacheKey = getCacheKey(query, activeRepo);

  totalQueries++;

  // Check LRU Cache
  if (cache.has(cacheKey)) {
    cacheHits++;
    const cachedResult = cache.get(cacheKey)!;
    console.log(`[RAG Cache Hit] Key: ${cacheKey} | Query: "${query}" | Repo: "${activeRepo}" | Hit rate: ${getCacheStats().hitRate.toFixed(2)}%`);
    
    if (onToken) {
      cachedResult.answer.split(/(\s+)/).forEach((tok: string) => onToken(tok));
    }

    const latencyMs = Date.now() - startTime;
    logLatency({
      query,
      latencyMs,
      cacheHit: true,
      retrievedChunks: cachedResult.sources.map((s: any) => s.file_path),
    });

    return cachedResult;
  }

  console.log(`[RAG Cache Miss] Query: "${query}" | Repo: "${activeRepo}"`);

  // Get initialized BM25 instance
  const bm25 = await getBM25();

  // Run searches in parallel, filtered by repo
  const [vres, bres] = await Promise.all([
    vectorSearch(query, 20, activeRepo),
    bm25.search(query, 20, activeRepo),
  ]);

  // Merge candidates by ID
  const map = new Map<number, any>();
  vres.forEach((r: any, i: number) => map.set(r.id, { ...r, vscore: 1 / (i + 1) }));
  
  bres.forEach((r: any) => {
    const ex = map.get(r.id);
    if (ex) {
      ex.bscore = r.score;
    } else {
      map.set(r.id, { ...r, bscore: r.score });
    }
  });

  // Calculate final fusion score
  const merged = Array.from(map.values()).map((m) => ({
    id: m.id,
    file_path: m.file_path,
    text: m.text,
    source_type: m.source_type,
    score: (m.vscore || 0) * 0.6 + (m.bscore || 0) * 0.4,
  }));

  // Sort and take top 20 candidates
  merged.sort((a, b) => b.score - a.score);
  const top20 = merged.slice(0, 20);

  // Rerank top 20 candidates to top 5 using the LLM
  const top5 = await rerank(query, top20, 5);

  // Prepare context and build the prompt
  const promptChunks = top5.map((c) => ({
    file_path: c.file_path,
    text: c.text,
  }));
  const { system, user } = buildPrompt(promptChunks, query);

  // Generate the answer by accumulating streamed tokens
  let answer = "";
  await generateAnswer(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    (tok: string) => {
      answer += tok;
      if (onToken) {
        onToken(tok);
      }
    },
  );

  const result = {
    answer,
    sources: top5,
  };

  // Cache final results
  cache.set(cacheKey, result);

  const latencyMs = Date.now() - startTime;
  logLatency({
    query,
    latencyMs,
    cacheHit: false,
    retrievedChunks: top5.map((s) => s.file_path),
  });

  return result;
}
