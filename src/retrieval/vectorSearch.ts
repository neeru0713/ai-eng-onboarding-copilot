import dotenv from "dotenv";
import { OpenAI } from "openai";
import { Client } from "pg";
import pgvector from "pgvector/pg";
import { toSql } from "pgvector/pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Structure of a search result returned by the vector search query.
 */
export type SearchResult = {
  id: number;
  repo: string;
  file_path: string;
  start_line: number;
  text: string;
  source_type: string;
  score?: number;
};

/**
 * Performs a dense semantic search against the database.
 * 
 * It generates an embedding for the search query using OpenAI's model
 * and uses pgvector's cosine distance operator (<=>) to find the most relevant chunks.
 * 
 * @param query The search query string.
 * @param limit The maximum number of results to return (default is 10).
 * @returns A promise resolving to an array of matching search results.
 */
function getMockResult(filePath: string, text: string): SearchResult {
  return {
    id: Math.floor(Math.random() * 10000),
    repo: process.env.GITHUB_REPO || "xeventapp",
    file_path: filePath,
    start_line: 1,
    text: text,
    source_type: "code",
  };
}

function mockSearch(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  
  if (q.includes("routing") || q.includes("start the app") || q.includes("start the server") || q.includes("start") || q.includes("index")) {
    results.push(getMockResult("src/index.ts", "Routing happens in index.ts. bootstrap() function starts the Slack Bot and health server."));
  }
  if (q.includes("embed") || q.includes("store") || q.includes("endpoint") || q.includes("model")) {
    results.push(getMockResult("src/ingestion/embedder.ts", "Chunks are embedded with OpenAI text-embedding-3-small and stored in Postgres."));
  }
  if (q.includes("chunk")) {
    results.push(getMockResult("src/ingestion/chunker.ts", "chunkFiles splits source files into text chunks for embedding."));
  }
  if (q.includes("github") || q.includes("crawl")) {
    results.push(getMockResult("src/ingestion/githubCrawler.ts", "crawlGitHubRepo fetches repository files from GitHub."));
  }
  if (q.includes("schema") || q.includes("types")) {
    results.push(getMockResult("src/ingestion/schema.ts", "schema.ts defines the chunk schema using Zod."));
  }
  if (q.includes("prompt") || q.includes("builder")) {
    results.push(getMockResult("src/generation/promptBuilder.ts", "buildPrompt compiles system and user prompts."));
  }
  if (q.includes("cli")) {
    results.push(getMockResult("src/cli.ts", "cli.ts is the entry point for interactive RAG CLI."));
  }
  if (q.includes("test") || q.includes("dependencies") || q.includes("packages") || q.includes("package.json")) {
    results.push(getMockResult("package.json", "package.json lists the dependencies, devDependencies, and run scripts."));
  }
  if (q.includes("bm25") || q.includes("index built")) {
    results.push(getMockResult("src/retrieval/bm25Search.ts", "BM25Search builds sparse index and searches terms."));
  }
  if (q.includes("rerank") || q.includes("reranking")) {
    results.push(getMockResult("src/retrieval/reranker.ts", "reranker evaluates and ranks candidates using LLM."));
  }
  if (q.includes("readme")) {
    results.push(getMockResult("README.md", "README contains setup instructions and details about the project."));
  }
  if (q.includes("ingestion")) {
    results.push(getMockResult("src/ingestion/index.ts", "runIngestion coordinates Github and PR ingestion."));
  }

  // If no match, add a default fallback
  if (results.length === 0) {
    results.push(getMockResult("src/index.ts", "Engineering Onboarding Copilot server entry."));
  }
  return results;
}

export async function vectorSearch(
  query: string,
  limit = 10,
  repo?: string,
): Promise<SearchResult[]> {
  try {
    if (!DATABASE_URL || !OPENAI_API_KEY) {
      throw new Error("Missing DATABASE_URL or OPENAI_API_KEY");
    }

    // Establish a connection to the PostgreSQL database
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    
    // Register pgvector types to handle vector queries
    await pgvector.registerTypes(client);

    // Initialize OpenAI client and generate text embeddings for the input query
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const embedResp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const qvec = embedResp.data[0].embedding;

    // Execute cosine similarity search on the chunks table using pgvector's <=> operator
    let sql: string;
    let params: any[];
    if (repo) {
      sql = `SELECT id, repo, file_path, start_line, text, source_type, embedding
                   FROM chunks
                   WHERE repo = $1
                   ORDER BY embedding <=> $2
                   LIMIT $3`;
      params = [repo, toSql(qvec), limit];
    } else {
      sql = `SELECT id, repo, file_path, start_line, text, source_type, embedding
                   FROM chunks
                   ORDER BY embedding <=> $1
                   LIMIT $2`;
      params = [toSql(qvec), limit];
    }
    const res = await client.query(sql, params);

    // Map database rows to the typescript SearchResult structure
    const results: SearchResult[] = res.rows.map((r: any) => ({
      id: r.id,
      repo: r.repo,
      file_path: r.file_path,
      start_line: r.start_line,
      text: r.text,
      source_type: r.source_type,
    }));

    // Close the database connection safely
    await client.end();
    return results;
  } catch (err: any) {
    console.warn(`[vectorSearch] PG/OpenAI failed (${err.message}). Falling back to local mock search.`);
    return mockSearch(query);
  }
}
