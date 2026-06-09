import readline from "readline";
import { vectorSearch } from "./retrieval/vectorSearch.js";
import { BM25Search } from "./retrieval/bm25Search.js";
import { rerank } from "./retrieval/reranker.js";
import { buildPrompt } from "./generation/promptBuilder.js";
import { generateAnswer } from "./generation/llmClient.js";

/**
 * The main entry point for the RAG (Retrieval-Augmented Generation) Command Line Interface.
 * 
 * This function orchestrates the entire application lifecycle:
 * 1. Establishes a terminal input/output interface (readline).
 * 2. Initializes and indexes the BM25 search engine from the PostgreSQL database.
 * 3. Sets up a listener to process user queries line-by-line using a hybrid search + reranking pipeline.
 */
async function main() {
  // Create an interface to read inputs from process.stdin and write outputs to process.stdout
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("RAG CLI ready. Ask a question or type `exit`.");

  // Initialize the BM25 keyword search engine
  const bm25 = new BM25Search();
  try {
    // Pull the raw documents from PostgreSQL database and construct the BM25 search index
    await bm25.initFromPostgres();
    bm25.index();
    console.log("BM25 index ready.");
  } catch (e: any) {
    console.warn("BM25 init failed:", e.message);
  }

  /**
   * Event listener triggered whenever a new line/query is entered in the terminal.
   * Processes the question through the hybrid search, reranking, and generation pipeline.
   */
  rl.on("line", async (line) => {
    const q = line.trim();
    if (!q) return; // Skip empty inputs
    
    // Graceful exit handler
    if (q.toLowerCase() === "exit") {
      rl.close();
      process.exit(0);
    }

    // --- PHASE 1: HYBRID RETRIEVAL ---
    
    // 1. Semantic / Dense Vector Search: Queries embeddings database to find top 20 matches based on meaning
    console.log("\nEmbedding + vector search...");
    const vres = await vectorSearch(q, 20);

    // 2. Keyword / Sparse Search: Uses BM25 algorithm to find top 20 matches containing the exact words
    console.log("Running BM25...");
    const bres = bm25.search(q, 20);

    // --- PHASE 2: HYBRID SCORE FUSION & MERGING ---
    // Merge candidates from both search algorithms by document ID to produce a single list
    const map = new Map<number, any>();
    
    // Add vector search results with reciprocal rank score (1 / (rank + 1))
    vres.forEach((r: any, i: number) => map.set(r.id, { ...r, vscore: 1 / (i + 1) }));
    
    // Combine with BM25 results, matching on document ID
    bres.forEach((r: any) => {
      const ex = map.get(r.id);
      if (ex) {
        ex.bscore = r.score;
      } else {
        map.set(r.id, { ...r, bscore: r.score });
      }
    });

    // Compute a final hybrid score: 60% weight on Vector rank, 40% weight on BM25 score
    const merged = Array.from(map.values()).map((m) => ({
      id: m.id,
      file_path: m.file_path,
      text: m.text,
      score: (m.vscore || 0) * 0.6 + (m.bscore || 0) * 0.4,
    }));

    // Sort the combined candidate list in descending order of final hybrid score
    merged.sort((a, b) => b.score - a.score);

    // --- PHASE 3: LLM-BASED RERANKING ---
    // Take the top 20 candidate documents and use the LLM to rerank them to select the top 5 most relevant
    console.log("Reranking (LLM)…");
    const top20 = merged.slice(0, 20);
    const top5 = await rerank(q, top20, 5);

    // --- PHASE 4: PROMPT GENERATION ---
    // Construct the context chunks and compile system/user prompts for the LLM
    const promptChunks = top5.map((c) => ({
      file_path: c.file_path,
      text: c.text,
    }));
    const { system, user } = buildPrompt(promptChunks, q);

    // --- PHASE 5: LLM ANSWER GENERATION ---
    // Stream the response back to the terminal as tokens arrive
    console.log("\nAnswer (streaming):\n");
    await generateAnswer(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      (tok: string) => process.stdout.write(tok),
    );

    // --- PHASE 6: SOURCE ATTRIBUTION ---
    // Display the file paths of the sources used to compile the answer
    console.log("\n\nSources:");
    top5.forEach((t) => console.log("-", t.file_path));
    console.log("\n---\n");
  });
}

// Execute the main loop and catch any unhandled top-level rejections/errors
main().catch((e) => {
  console.error("CLI error:", e);
  process.exit(1);
});

