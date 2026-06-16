import { queryRAG, getCacheStats, resetCacheStats } from "./rag.js";

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

import { fileURLToPath } from "url";

export async function runEval() {
  console.log("=== Running Evaluation - Run 1 (Cold Cache) ===");
  resetCacheStats();

  let hits = 0;

  for (const item of QUESTIONS) {
    console.log("Evaluating:", item.question);
    try {
      const res = await queryRAG(item.question);
      const found = res.sources.some((t: any) => t.file_path === item.expectedFile);
      if (found) hits += 1;
      console.log("Expected:", item.expectedFile, "Found in top5?", found);
    } catch (e: any) {
      console.error(`Evaluation query failed for "${item.question}":`, e.message);
    }
  }

  const recall = hits / QUESTIONS.length;
  console.log(`\nRun 1 Recall@5: ${recall.toFixed(2)} (${hits}/${QUESTIONS.length})`);
  console.log(`Run 1 Cache Stats:`, getCacheStats());

  console.log("\n=== Running Evaluation - Run 2 (Warm Cache) ===");
  let secondRunHits = 0;

  for (const item of QUESTIONS) {
    console.log("Evaluating (Run 2):", item.question);
    const startHits = getCacheStats().cacheHits;
    try {
      await queryRAG(item.question);
      const endHits = getCacheStats().cacheHits;
      if (endHits > startHits) {
        secondRunHits += 1;
      }
    } catch (e: any) {
      console.error(`Evaluation query failed on Run 2 for "${item.question}":`, e.message);
    }
  }

  const cacheHitRate = (secondRunHits / QUESTIONS.length) * 100;
  console.log(`\nRun 2 Cache Hit Rate: ${cacheHitRate.toFixed(2)}% (${secondRunHits}/${QUESTIONS.length})`);
  console.log(`Overall Cache Stats:`, getCacheStats());

  return recall;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runEval().catch((e) => console.error(e));
}
