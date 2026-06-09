/**
 * Compiles system and user prompts to feed into the LLM during answer generation.
 * It formats retrieved context chunks with their file path information, ensuring the LLM is grounded.
 * 
 * @param retrievedChunks The top K retrieved context documents.
 * @param question The user's query/question.
 * @returns An object containing system prompt, context string, and user prompt.
 */
export function buildPrompt(
  retrievedChunks: { file_path: string; text: string }[],
  question: string,
) {
  // Define system instructions instructing the LLM on behavior, citations, and grounding limits
  const system = `You are a helpful assistant. Always cite exact file paths. Never reference files not in context.`;

  // Format each retrieved text chunk under a structured header containing the document's file path
  const context = retrievedChunks
    .map(
      (c, i) => `---
File: ${c.file_path}
Chunk ${i + 1}:
${c.text}
---`,
    )
    .join("\n\n");

  // Construct the user message injecting instructions and the actual question
  const user = `Use the context to answer the question. Cite files (exact file paths) inline when referencing code.\n\nQuestion: ${question}`;

  return { system, context, user };
}

