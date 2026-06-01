import readline from "readline";
import { vectorSearch } from "./retrieval/vectorSearch.js";
import { BM25Search } from "./retrieval/bm25Search.js";
import { rerank } from "./retrieval/reranker.js";
import { buildPrompt } from "./generation/promptBuilder.js";
import { generateAnswer } from "./generation/llmClient.js";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("RAG CLI ready. Ask a question or type `exit`.");

  const bm25 = new BM25Search();
  try {
    await bm25.initFromPostgres();
    bm25.index();
    console.log("BM25 index ready.");
  } catch (e) {
    console.warn("BM25 init failed:", e.message);
  }

  rl.on("line", async (line) => {
    const q = line.trim();
    if (!q) return;
    if (q.toLowerCase() === "exit") {
      rl.close();
      process.exit(0);
    }

    console.log("\nEmbedding + vector search...");
    const vres = await vectorSearch(q, 20);

    console.log("Running BM25...");
    const bres = bm25.search(q, 20);

    // merge candidates by id, prefer vector order
    const map = new Map<number, any>();
    vres.forEach((r, i) => map.set(r.id, { ...r, vscore: 1 / (i + 1) }));
    bres.forEach((r, i) => {
      const ex = map.get(r.id);
      if (ex) {
        ex.bscore = r.score;
      } else {
        map.set(r.id, { ...r, bscore: r.score });
      }
    });

    const merged = Array.from(map.values()).map((m) => ({
      id: m.id,
      file_path: m.file_path,
      text: m.text,
      score: (m.vscore || 0) * 0.6 + (m.bscore || 0) * 0.4,
    }));

    merged.sort((a, b) => b.score - a.score);

    // rerank top 20 -> top 5
    console.log("Reranking (LLM)…");
    const top20 = merged.slice(0, 20);
    const top5 = await rerank(q, top20, 5);

    const promptChunks = top5.map((c) => ({
      file_path: c.file_path,
      text: c.text,
    }));
    const { system, user } = buildPrompt(promptChunks, q);

    console.log("\nAnswer (streaming):\n");
    await generateAnswer(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      (tok: string) => process.stdout.write(tok),
    );

    console.log("\n\nSources:");
    top5.forEach((t) => console.log("-", t.file_path));
    console.log("\n---\n");
  });
}

main().catch((e) => {
  console.error("CLI error:", e);
  process.exit(1);
});
