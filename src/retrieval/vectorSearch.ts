import dotenv from "dotenv";
import { OpenAI } from "openai";
import { Client } from "pg";
import pgvector from "pgvector/pg";
import { toSql } from "pgvector/pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export type SearchResult = {
  id: number;
  repo: string;
  file_path: string;
  start_line: number;
  text: string;
  score?: number;
};

export async function vectorSearch(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await pgvector.registerTypes(client);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const embedResp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const qvec = embedResp.data[0].embedding;

  const sql = `SELECT id, repo, file_path, start_line, text, embedding
               FROM chunks
               ORDER BY embedding <=> $1
               LIMIT $2`;
  const res = await client.query(sql, [toSql(qvec), limit]);

  const results: SearchResult[] = res.rows.map((r: any, idx: number) => ({
    id: r.id,
    repo: r.repo,
    file_path: r.file_path,
    start_line: r.start_line,
    text: r.text,
  }));

  await client.end();
  return results;
}
