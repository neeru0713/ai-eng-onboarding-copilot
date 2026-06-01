export function buildPrompt(
  retrievedChunks: { file_path: string; text: string }[],
  question: string,
) {
  const system = `You are a helpful assistant. Always cite exact file paths. Never reference files not in context.`;
  const context = retrievedChunks
    .map(
      (c, i) => `---
File: ${c.file_path}
Chunk ${i + 1}:
${c.text}
---`,
    )
    .join("\n\n");

  const user = `Use the context to answer the question. Cite files (exact file paths) inline when referencing code.\n\nQuestion: ${question}`;

  return { system, context, user };
}
