import { chunksSchema, type Chunk } from './schema.js';
import type { GitHubFile } from './githubCrawler.js';

const CHUNK_SIZE = 480;
const CHUNK_OVERLAP = 50;

export async function chunkFiles(files: GitHubFile[]): Promise<Chunk[]> {
  console.log(`Chunking ${files.length} file(s)`);

  const chunks: Chunk[] = [];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    let buffer = '';
    let chunkStartLine = 1;
    let lineNumber = 1;

    for (const line of lines) {
      const nextBuffer = buffer ? `${buffer}\n${line}` : line;

      if (nextBuffer.length > CHUNK_SIZE && buffer) {
        chunks.push({
          repo: file.repo,
          filePath: file.path,
          startLine: chunkStartLine,
          text: buffer,
          source: 'github',
          commitSha: file.commitSha,
        });

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
        source: 'github',
        commitSha: file.commitSha,
      });
    }
  }

  const validatedChunks = chunksSchema.parse(chunks);
  console.log(`Created ${validatedChunks.length} chunk(s) from the repository.`);
  return validatedChunks;
}
