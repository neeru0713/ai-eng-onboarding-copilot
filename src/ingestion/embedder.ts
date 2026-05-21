export async function embedChunks(chunks: Array<{ filePath: string; text: string }>) {
  console.log(`Placeholder: embed ${chunks.length} chunk(s)`);
  return chunks.map((chunk) => ({ ...chunk, vector: [] }));
}
