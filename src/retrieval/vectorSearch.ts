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
export async function vectorSearch(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

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
  const sql = `SELECT id, repo, file_path, start_line, text, source_type, embedding
               FROM chunks
               ORDER BY embedding <=> $1
               LIMIT $2`;
  const res = await client.query(sql, [toSql(qvec), limit]);

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
}
