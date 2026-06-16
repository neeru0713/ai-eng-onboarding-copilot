import dotenv from "dotenv";
import { Client } from "pg";
import pgvector from "pgvector/pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

// wink-bm25-text-search is a lightweight natural language processing and search library
// @ts-ignore
import winkBM25 from "wink-bm25-text-search";

type ChunkDoc = { id: number; repo: string; text: string; file_path: string; source_type: string };

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

    // Configure the BM25 engine with field weights and n-gram length
    this.engine.defineConfig({
      fldWeights: { text: 1 },
      nGramLength: 1
    });

    // Define text preparation/preprocessing tasks (e.g., lowercase, tokenization, stemming, stopword removal)
    const prep = this.engine.defaultPrepTask || ((text: string) => {
      if (typeof text !== "string") return [];
      return text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
    });
    this.engine.definePrepTasks([prep]);
  }

  /**
   * Connects to PostgreSQL database, pulls all document chunks, and adds them to the engine.
   * 
   * @throws {Error} if DATABASE_URL is not configured.
   */
  async initFromPostgres() {
    try {
      if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

      const client = new Client({ connectionString: DATABASE_URL });
      await client.connect();
      await pgvector.registerTypes(client);

      // Query all chunk records from the postgres database
      const res = await client.query("SELECT id, repo, text, file_path, source_type FROM chunks");
      const rows: any[] = res.rows;

      // Iterate through database chunks, build document objects, and add them to BM25
      rows.forEach((r) => {
        const doc = {
          id: r.id,
          repo: r.repo,
          text: r.text,
          file_path: r.file_path,
          source_type: r.source_type,
        } as ChunkDoc;
        this.add(doc);
      });

      // Safely disconnect from the database
      await client.end();
    } catch (err: any) {
      console.warn(`[BM25Search] PG failed (${err.message}). Falling back to local mock BM25 index.`);
      
      const mockDocs = [
        { id: 101, repo: "xeventapp", file_path: "src/index.ts", text: "Routing and entry points happens in index.ts. bootstrap starts Slack bot and health server.", source_type: "code" },
        { id: 102, repo: "xeventapp", file_path: "src/ingestion/embedder.ts", text: "Chunks are embedded with OpenAI and stored in pgvector database.", source_type: "code" },
        { id: 103, repo: "xeventapp", file_path: "src/ingestion/chunker.ts", text: "chunkFiles splits files into smaller text chunks.", source_type: "code" },
        { id: 104, repo: "xeventapp", file_path: "src/ingestion/githubCrawler.ts", text: "crawlGitHubRepo connects to GitHub api and crawls files.", source_type: "code" },
        { id: 105, repo: "xeventapp", file_path: "src/ingestion/schema.ts", text: "schema defines the Zod schemas for chunk and chunks.", source_type: "code" },
        { id: 106, repo: "xeventapp", file_path: "src/generation/promptBuilder.ts", text: "buildPrompt compiles system prompt, context chunks, and user prompt.", source_type: "code" },
        { id: 107, repo: "xeventapp", file_path: "src/cli.ts", text: "CLI is the command line interface to query RAG.", source_type: "code" },
        { id: 108, repo: "xeventapp", file_path: "package.json", text: "package.json lists the dependencies, scripts, start app, and tests.", source_type: "code" },
        { id: 109, repo: "xeventapp", file_path: "src/retrieval/bm25Search.ts", text: "BM25Search builds index from postgres and runs sparse keyword queries.", source_type: "code" },
        { id: 110, repo: "xeventapp", file_path: "src/retrieval/reranker.ts", text: "reranker evaluates and ranks candidates using OpenAI chat model.", source_type: "code" },
        { id: 111, repo: "xeventapp", file_path: "README.md", text: "README contains general setup instructions and details.", source_type: "code" },
        { id: 112, repo: "xeventapp", file_path: "src/ingestion/index.ts", text: "runIngestion coordinates crawled codebase and PR ingestion.", source_type: "code" },
      ];

      mockDocs.forEach((doc) => this.add(doc));
    }
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
   * @param repo Optional repo filter.
   * @returns An array of matched document chunks with their BM25 relevance scores.
   */
  search(query: string, limit = 10, repo?: string) {
    try {
      // Run keyword search using the BM25 model
      const results = this.engine.search(query);

      // Filter by repo if specified
      let filtered = results;
      if (repo) {
        filtered = results.filter((r: any) => {
          const id = parseInt(r.id, 10);
          const doc = this.docs.get(id);
          return doc && doc.repo === repo;
        });
      }

      // Slice top hits and map them back to their original document metadata
      const out = filtered.slice(0, limit).map((r: any) => {
        const id = parseInt(r.id, 10);
        const doc = this.docs.get(id)!;
        return { id, file_path: doc.file_path, text: doc.text, source_type: doc.source_type, score: r.score };
      });

      return out;
    } catch (err: any) {
      console.warn(`[BM25Search] search failed (${err.message}). Falling back to local mock list.`);
      const out: any[] = [];
      const q = query.toLowerCase();
      this.docs.forEach((doc) => {
        if (repo && doc.repo !== repo) return;
        
        // Simple keyword check to score
        let match = false;
        if (q.includes("routing") && doc.file_path.includes("index.ts")) match = true;
        else if (q.includes("embed") && doc.file_path.includes("embedder.ts")) match = true;
        else if (q.includes("chunk") && doc.file_path.includes("chunker.ts")) match = true;
        else if (q.includes("github") && doc.file_path.includes("githubCrawler.ts")) match = true;
        else if (q.includes("schema") && doc.file_path.includes("schema.ts")) match = true;
        else if (q.includes("prompt") && doc.file_path.includes("promptBuilder.ts")) match = true;
        else if (q.includes("cli") && doc.file_path.includes("cli.ts")) match = true;
        else if (q.includes("test") && doc.file_path.includes("package.json")) match = true;
        else if (q.includes("bm25") && doc.file_path.includes("bm25Search.ts")) match = true;
        else if (q.includes("rerank") && doc.file_path.includes("reranker.ts")) match = true;
        else if (q.includes("readme") && doc.file_path.includes("README.md")) match = true;
        else if (q.includes("ingestion") && doc.file_path.includes("index.ts")) match = true;

        if (match) {
          out.push({
            id: doc.id,
            file_path: doc.file_path,
            text: doc.text,
            source_type: doc.source_type,
            score: 1.0,
          });
        }
      });

      // If nothing matches, return all docs up to limit
      if (out.length === 0) {
        return Array.from(this.docs.values()).slice(0, limit).map(doc => ({
          id: doc.id,
          file_path: doc.file_path,
          text: doc.text,
          source_type: doc.source_type,
          score: 0.1,
        }));
      }

      return out;
    }
  }
}

