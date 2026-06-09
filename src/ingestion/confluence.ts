import { crawlConfluenceSpace } from "./confluenceCrawler.js";
import { embedChunks } from "./embedder.js";
import type { Chunk } from "./schema.js";

const CHUNK_SIZE = 480;
const CHUNK_OVERLAP = 50;

/**
 * Splits a list of Confluence pages into overlapping semantic text chunks.
 * 
 * @param pages List of pages to chunk.
 * @param spaceKey Space key which acts as the 'repo' identifier.
 * @returns Array of database-insertable Chunk objects.
 */
function chunkConfluencePages(pages: any[], spaceKey: string): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const headerPrefix = `Document: ${page.title}\nURL: ${page.url}\n\n`;
    const lines = page.content.split(/\r?\n/);
    
    let buffer = headerPrefix;
    let chunkStartLine = 1;
    let lineNumber = 1;

    for (const line of lines) {
      const nextBuffer = buffer ? `${buffer}\n${line}` : line;

      // When the chunk exceeds the size, slice and start a new one with overlap
      if (nextBuffer.length > CHUNK_SIZE && buffer.length > headerPrefix.length) {
        chunks.push({
          repo: spaceKey,
          filePath: page.title,
          startLine: chunkStartLine,
          text: buffer,
          source: "confluence",
        });

        // Compute overlap index from the end of the current buffer (ignoring title prefix length to keep context distinct)
        const contentStart = headerPrefix.length;
        const bodyContent = buffer.slice(contentStart);
        const overlapStart = Math.max(0, bodyContent.length - CHUNK_OVERLAP);
        
        buffer = headerPrefix + bodyContent.slice(overlapStart) + "\n" + line;
        chunkStartLine = lineNumber;
      } else {
        buffer = nextBuffer;
      }
      lineNumber += 1;
    }

    // Capture the final leftover content
    if (buffer.trim().length > headerPrefix.trim().length) {
      chunks.push({
        repo: spaceKey,
        filePath: page.title,
        startLine: chunkStartLine,
        text: buffer,
        source: "confluence",
      });
    }
  }

  return chunks;
}

async function run() {
  const args = process.argv.slice(2);
  const spaceIndex = args.indexOf("--space");
  
  if (spaceIndex === -1 || !args[spaceIndex + 1]) {
    console.error("Error: --space <SpaceKey> parameter is required.");
    console.error("Usage: npx ts-node src/ingestion/confluence.ts --space ENG");
    process.exit(1);
  }

  const spaceKey = args[spaceIndex + 1];

  try {
    console.log(`Starting Confluence ingestion for space ${spaceKey}...`);
    const pages = await crawlConfluenceSpace(spaceKey);
    
    if (pages.length === 0) {
      console.log("No pages found to ingest.");
      process.exit(0);
    }

    const chunks = chunkConfluencePages(pages, spaceKey);
    console.log(`Created ${chunks.length} chunks from Confluence pages.`);

    await embedChunks(chunks);
    console.log("Confluence ingestion completed successfully!");
  } catch (error) {
    console.error("Confluence ingestion failed:", error);
    process.exit(1);
  }
}

run();
