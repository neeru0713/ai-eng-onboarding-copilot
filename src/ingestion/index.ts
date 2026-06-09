import { crawlGitHubRepo } from './githubCrawler.js';
import { chunkFiles } from './chunker.js';
import { embedChunks } from './embedder.js';
import { crawlPRs } from './prCrawler.js';

import { fileURLToPath } from 'url';

export async function runIngestion() {
  console.log('Starting ingestion pipeline...');

  // 1. Code Ingestion
  console.log('\n--- Ingesting Repository Code ---');
  const filePaths = await crawlGitHubRepo();
  console.log('crawlGitHubRepo returned files:', filePaths.length);

  const codeChunks = await chunkFiles(filePaths);
  console.log('chunkFiles returned chunks:', codeChunks.length);

  if (codeChunks.length > 0) {
    await embedChunks(codeChunks);
  }

  // 2. PR Ingestion
  console.log('\n--- Ingesting Pull Requests ---');
  try {
    const prChunks = await crawlPRs();
    if (prChunks.length > 0) {
      await embedChunks(prChunks);
    } else {
      console.log('No PRs found to ingest.');
    }
  } catch (err: any) {
    console.error('PR Ingestion failed:', err.message);
  }

  console.log('\nIngestion pipeline finished successfully.');
}

// Check if this module is being run directly from the command line
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runIngestion().catch((error) => {
    console.error('Ingestion failed:', error);
    process.exit(1);
  });
}
