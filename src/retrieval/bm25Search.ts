import dotenv from "dotenv";
import { Client } from "pg";
import pgvector from "pgvector/pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

// wink-bm25-text-search
import winkBM25 from "wink-bm25-text-search";

type ChunkDoc = { id: number; text: string; file_path: string };

export class BM25Search {
  private engine: any;
  private docs: Map<number, ChunkDoc> = new Map();

  constructor() {
    this.engine = winkBM25();
    this.engine.defineConfig({ fldWeights: { text: 1 } });
    this.engine.definePrepTasks([this.engine.defaultPrepTask]);
    this.engine.defineConfig({ nGramLength: 1 });
  }

  async initFromPostgres() {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await pgvector.registerTypes(client);

    const res = await client.query("SELECT id, text, file_path FROM chunks");
    const rows: any[] = res.rows;

    rows.forEach((r) => {
      const doc = {
        id: r.id,
        text: r.text,
        file_path: r.file_path,
      } as ChunkDoc;
      this.add(doc);
    });

    await client.end();
  }

  add(doc: ChunkDoc) {
    this.docs.set(doc.id, doc);
    this.engine.addDoc(doc, doc.id.toString());
  }

  index() {
    this.engine.consolidate();
  }

  search(query: string, limit = 10) {
    const results = this.engine.search(query);
    const out = results.slice(0, limit).map((r: any) => {
      const id = parseInt(r.id, 10);
      const doc = this.docs.get(id)!;
      return { id, file_path: doc.file_path, text: doc.text, score: r.score };
    });
    return out;
  }
}
