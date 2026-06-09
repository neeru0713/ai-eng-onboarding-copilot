import { chunksSchema, type Chunk } from './schema.js';
import type { GitHubFile } from './githubCrawler.js';

const CHUNK_SIZE = 480;
const CHUNK_OVERLAP = 50;

export async function chunkFiles(files: GitHubFile[]): Promise<Chunk[]> {
  console.log(`Chunking ${files.length} file(s)`);

  const chunks: Chunk[] = [];

  for (const file of files) {

    
    console.log(`Processing file: ${file.path}`);
    const lines = file.content.split(/\r?\n/);
    console.log(`  File line count: ${lines.length}`);
    let buffer = '';
    let chunkStartLine = 1;
    let lineNumber = 1;
    const beforeChunks = chunks.length;

    for (const line of lines) {
      const nextBuffer = buffer ? `${buffer}\n${line}` : line;

      if (nextBuffer.length > CHUNK_SIZE && buffer) {
        chunks.push({
          repo: file.repo,
          filePath: file.path,
          startLine: chunkStartLine,
          text: buffer,
          source: 'code',
          commitSha: file.commitSha,
        });

        console.log(`  Created chunk ${chunks.length} for ${file.path}: startLine=${chunkStartLine}, length=${buffer.length}`);

        const overlapStart = Math.max(0, buffer.length - CHUNK_OVERLAP);
        buffer = buffer.slice(overlapStart) + '\n' + line;
        chunkStartLine = lineNumber;
      } else {
        buffer = nextBuffer;
      }

      lineNumber += 1;
    }

    if (buffer.trim().length > 0) {
      chunks.push({
        repo: file.repo,
        filePath: file.path,
        startLine: chunkStartLine,
        text: buffer,
        source: 'code',
        commitSha: file.commitSha,
      });
      console.log(`  Final chunk for ${file.path}: startLine=${chunkStartLine}, length=${buffer.length}`);
    }

    console.log(`Finished ${file.path}: created ${chunks.length - beforeChunks} chunk(s)`);
  }

  const validatedChunks = chunksSchema.parse(chunks);
  console.log(`Created ${validatedChunks.length} chunk(s) from the repository.`);
  console.log('Sample chunk metadata:', validatedChunks.slice(0, 5).map((chunk) => ({ filePath: chunk.filePath, startLine: chunk.startLine, textLength: chunk.text.length })));
  return validatedChunks;
}
