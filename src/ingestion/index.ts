import { crawlGitHubRepo } from './githubCrawler.js';
import { chunkFiles } from './chunker.js';
import { embedChunks } from './embedder.js';

async function main() {
  console.log('Starting ingestion pipeline...');

  const filePaths = await crawlGitHubRepo();
  const chunks = await chunkFiles(filePaths);
  await embedChunks(chunks);

  console.log('Ingestion scaffold finished.');
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
