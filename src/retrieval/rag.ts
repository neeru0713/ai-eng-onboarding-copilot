import { vectorSearch } from "./vectorSearch.js";
import { BM25Search } from "./bm25Search.js";
import { rerank } from "./reranker.js";
import { buildPrompt } from "../generation/promptBuilder.js";
import { generateAnswer } from "../generation/llmClient.js";

let bm25Instance: BM25Search | null = null;

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
 * @returns An object containing the generated answer and the source chunks used.
 */
export async function queryRAG(query: string, onToken?: (tok: string) => void) {
  // Get initialized BM25 instance
  const bm25 = await getBM25();

  // Run searches in parallel
  const [vres, bres] = await Promise.all([
    vectorSearch(query, 20),
    bm25.search(query, 20),
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

  return {
    answer,
    sources: top5,
  };
}
