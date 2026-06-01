import { crawlGitHubRepo } from './githubCrawler.js';
import { chunkFiles } from './chunker.js';
import { embedChunks } from './embedder.js';

async function main() {
  console.log('Starting ingestion pipeline...');

  const filePaths = await crawlGitHubRepo();
  console.log('crawlGitHubRepo returned files:', filePaths.length);
  console.log('Sample file paths:', filePaths.slice(0, 10).map((file) => file.path));

  const chunks = await chunkFiles(filePaths);
  console.log('chunkFiles returned chunks:', chunks.length);
  console.log('Sample chunks:', chunks.slice(0, 5).map((chunk) => ({ filePath: chunk.filePath, startLine: chunk.startLine, textLength: chunk.text.length })));

  await embedChunks(chunks);

  console.log('Ingestion scaffold finished.');
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
