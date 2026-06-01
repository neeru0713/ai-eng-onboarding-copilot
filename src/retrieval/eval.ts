import { vectorSearch } from "./vectorSearch.js";
import { BM25Search } from "./bm25Search.js";
import { rerank } from "./reranker.js";

type EvalItem = { question: string; expectedFile: string };

const QUESTIONS: EvalItem[] = [
  { question: "where does routing happen?", expectedFile: "src/index.ts" },
  {
    question: "how are chunks embedded?",
    expectedFile: "src/ingestion/embedder.ts",
  },
  {
    question: "where is the chunker?",
    expectedFile: "src/ingestion/chunker.ts",
  },
  {
    question: "how is github crawled?",
    expectedFile: "src/ingestion/githubCrawler.ts",
  },
  {
    question: "what does schema define?",
    expectedFile: "src/ingestion/schema.ts",
  },
  {
    question: "how do we build prompts?",
    expectedFile: "src/generation/promptBuilder.ts",
  },
  { question: "where is the CLI?", expectedFile: "src/cli.ts" },
  {
    question: "where are embeddings stored?",
    expectedFile: "src/ingestion/embedder.ts",
  },
  { question: "how do we start the app?", expectedFile: "package.json" },
  { question: "how to run tests?", expectedFile: "package.json" },
  {
    question: "which model is used for embeddings?",
    expectedFile: "src/ingestion/embedder.ts",
  },
  {
    question: "where is bm25 index built?",
    expectedFile: "src/retrieval/bm25Search.ts",
  },
  {
    question: "how is reranking implemented?",
    expectedFile: "src/retrieval/reranker.ts",
  },
  {
    question: "where are chunk texts stored?",
    expectedFile: "src/ingestion/embedder.ts",
  },
  {
    question: "where is the prompt builder?",
    expectedFile: "src/generation/promptBuilder.ts",
  },
  { question: "how to run the CLI", expectedFile: "src/cli.ts" },
  { question: "what is the README about?", expectedFile: "README.md" },
  {
    question: "where are ingestion helpers?",
    expectedFile: "src/ingestion/index.ts",
  },
  {
    question: "where to find schema types?",
    expectedFile: "src/ingestion/schema.ts",
  },
  {
    question: "where is the embed endpoint?",
    expectedFile: "src/ingestion/embedder.ts",
  },
];

export async function runEval() {
  const bm25 = new BM25Search();
  try {
    await bm25.initFromPostgres();
    bm25.index();
  } catch (e) {
    console.warn("BM25 init failed:", e.message);
  }

  let hits = 0;

  for (const item of QUESTIONS) {
    console.log("Evaluating:", item.question);
    const vres = await vectorSearch(item.question, 20);
    const bres = bm25.search(item.question, 20);

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
    const top20 = merged.slice(0, 20);
    const top5 = await rerank(item.question, top20, 5);

    const found = top5.some((t) => t.file_path === item.expectedFile);
    if (found) hits += 1;
    console.log("Expected:", item.expectedFile, "Found in top5?", found);
  }

  const recall = hits / QUESTIONS.length;
  console.log(`\nRecall@5: ${recall.toFixed(2)} (${hits}/${QUESTIONS.length})`);
  return recall;
}

if (require.main === module) {
  runEval().catch((e) => console.error(e));
}
