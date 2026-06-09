import dotenv from "dotenv";
import { Client } from "pg";
import pgvector from "pgvector/pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

// wink-bm25-text-search is a lightweight natural language processing and search library
// @ts-ignore
import winkBM25 from "wink-bm25-text-search";

type ChunkDoc = { id: number; text: string; file_path: string; source_type: string };

/**
 * A BM25-based keyword/sparse search implementation.
 * 
 * It utilizes the BM25 (Best Matching 25) ranking function to retrieve and score
 * document chunks from a database based on matching terms.
 */
export class BM25Search {
  // The underlying wink-bm25 search engine instance
  private engine: any;
  // A local cache mapping chunk IDs to document metadata (text, file path)
  private docs: Map<number, ChunkDoc> = new Map();

  /**
   * Initializes the BM25 search engine with required configurations.
   */
  constructor() {
    this.engine = winkBM25();

    // Set field weights: give a weight of 1 to the 'text' property of document chunks
    this.engine.defineConfig({ fldWeights: { text: 1 } });

    // Define text preparation/preprocessing tasks (e.g., lowercase, tokenization, stemming, stopword removal)
    this.engine.definePrepTasks([this.engine.defaultPrepTask]);

    // Configure n-gram length (1 = unigrams/single words)
    this.engine.defineConfig({ nGramLength: 1 });
  }

  /**
   * Connects to PostgreSQL database, pulls all document chunks, and adds them to the engine.
   * 
   * @throws {Error} if DATABASE_URL is not configured.
   */
  async initFromPostgres() {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await pgvector.registerTypes(client);

    // Query all chunk records from the postgres database
    const res = await client.query("SELECT id, text, file_path, source_type FROM chunks");
    const rows: any[] = res.rows;

    // Iterate through database chunks, build document objects, and add them to BM25
    rows.forEach((r) => {
      const doc = {
        id: r.id,
        text: r.text,
        file_path: r.file_path,
        source_type: r.source_type,
      } as ChunkDoc;
      this.add(doc);
    });

    // Safely disconnect from the database
    await client.end();
  }

  /**
   * Adds a single document chunk to the search cache and the indexing engine.
   * 
   * @param doc The document chunk object to add.
   */
  add(doc: ChunkDoc) {
    // Store in our local quick-lookup cache
    this.docs.set(doc.id, doc);

    // Register the document text with its stringified ID in the BM25 engine
    this.engine.addDoc(doc, doc.id.toString());
  }

  /**
   * Consolidates term and document statistics to build the final index.
   * Must be called after all documents are added and before search queries are run.
   */
  index() {
    // Compiles corpus statistics (TF-IDF, term frequencies) to finalize the search index
    this.engine.consolidate();
  }

  /**
   * Searches the BM25 index for the query text and returns matching chunks.
   * 
   * @param query The user's query string.
   * @param limit The maximum number of search results to return (defaults to 10).
   * @returns An array of matched document chunks with their BM25 relevance scores.
   */
  search(query: string, limit = 10) {
    // Run keyword search using the BM25 model
    const results = this.engine.search(query);

    // Slice top hits and map them back to their original document metadata
    const out = results.slice(0, limit).map((r: any) => {
      const id = parseInt(r.id, 10); +
      const doc = this.docs.get(id)!;
      return { id, file_path: doc.file_path, text: doc.text, source_type: doc.source_type, score: r.score };
    });

    return out;
  }
}

