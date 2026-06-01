import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { Client } from 'pg';
import pgvector from 'pgvector/pg';
import { toSql } from 'pgvector/pg';
import type { Chunk } from './schema.js';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function maskValue(value?: string) {
  if (!value) return 'undefined';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function createChunkTable(client: Client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await client.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id BIGSERIAL PRIMARY KEY,
      repo TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INT NOT NULL,
      text TEXT NOT NULL,
      commit_sha TEXT,
      source_type TEXT NOT NULL,
      metadata JSONB NOT NULL,
      embedding vector(1536) NOT NULL
    );
  `);
}

export async function embedChunks(chunks: Chunk[]) {
  console.log('Embedding configuration:');
  console.log({
    chunkCount: chunks.length,
    databaseUrl: DATABASE_URL ? 'set' : 'undefined',
    openAiKey: OPENAI_API_KEY ? maskValue(OPENAI_API_KEY) : 'undefined',
  });

  if (!OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set. Skipping embedding step.');
    return [];
  }

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required to store vectors in Postgres.');
  }

  console.log(`Embedding ${chunks.length} chunk(s) with OpenAI...`);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to Postgres.');
  await pgvector.registerTypes(client);
  await createChunkTable(client);
  console.log('Chunk table is ready.');

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const texts = chunks.map((chunk) => chunk.text);

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });

  const vectors = response.data.map((item) => item.embedding);
  console.log(`OpenAI returned ${vectors.length} embedding vector(s).`);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const vector = vectors[i];
    console.log(`Inserting chunk ${i + 1}/${chunks.length}: ${chunk.filePath} startLine=${chunk.startLine} vectorLength=${vector.length}`);

    await client.query(
      `INSERT INTO chunks (repo, file_path, start_line, text, commit_sha, source_type, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        chunk.repo,
        chunk.filePath,
        chunk.startLine,
        chunk.text,
        chunk.commitSha ?? null,
        chunk.source,
        { source: chunk.source, filePath: chunk.filePath, repo: chunk.repo },
        toSql(vector),
      ],
    );
  }

  await client.end();
  console.log('Saved embeddings to Postgres.');
  return chunks;
}
