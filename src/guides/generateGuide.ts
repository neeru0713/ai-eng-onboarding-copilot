import dotenv from "dotenv";
import { queryRAG } from "../retrieval/rag.js";

dotenv.config();

// Let's import the default export from '@anthropic-ai/sdk'
import AnthropicSDK from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Generates a Day-1 guide for a new engineer of a specific role joining a repository codebase.
 * It runs 6 targeted RAG queries covering different topics, assembles their answers as context,
 * and calls Claude to generate a structured day-1 guide.
 * 
 * @param repo The repository name.
 * @param role The engineering role (e.g., backend, frontend).
 * @returns The generated day-1 guide text.
 */
export async function generateGuide(repo: string, role: string): Promise<string> {
  console.log(`[generateGuide] Starting guide generation for repo: ${repo}, role: ${role}`);

  // Run 6 targeted RAG queries in parallel
  const [entryPoints, auth, dataLayer, configs, prs, ownership] = await Promise.all([
    queryRAG(`What are the entry points and routing files in the ${repo} codebase?`, undefined, repo),
    queryRAG(`How does authentication and authorization work in the ${repo} codebase?`, undefined, repo),
    queryRAG(`What does the data layer, database schema, and models look like in the ${repo} codebase?`, undefined, repo),
    queryRAG(`What are the key configuration files in the ${repo} codebase?`, undefined, repo),
    queryRAG(`What are the top 5 pull requests to read to understand the ${repo} codebase?`, undefined, repo),
    queryRAG(`Who has team ownership and who are the key maintainers of the ${repo} codebase?`, undefined, repo),
  ]);

  const assembledContext = `
=== 1. Entry Points & Routing ===
${entryPoints.answer}

=== 2. Authentication & Authorization ===
${auth.answer}

=== 3. Data Layer & Database ===
${dataLayer.answer}

=== 4. Key Configuration Files ===
${configs.answer}

=== 5. Top 5 Pull Requests to Read ===
${prs.answer}

=== 6. Team Ownership & Maintainers ===
${ownership.answer}
`;

  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment variables");
  }

  // Construct Anthropic Client
  const client = new AnthropicSDK.Client(ANTHROPIC_API_KEY);

  const systemPrompt = "Do not use any general knowledge about typical codebases. Only use the retrieved context provided. If context is insufficient, say so explicitly.";
  
  // Format the prompt following the old Human/Assistant structure
  const prompt = `${AnthropicSDK.HUMAN_PROMPT} ${systemPrompt}

Based only on the following retrieved context, generate a day-1 guide for a ${role} engineer joining the ${repo} codebase.

Format the output as a Slack DM to the new engineer:
- Include structured sections with clear headers (e.g. *Entry Points*, *Auth*, etc.)
- Use bullet points per section
- Format any file paths or links as Slack link format (e.g. <file:///path/to/file|file_name> or <https://github.com/...|file_name>)

Retrieved Context:
${assembledContext}

${AnthropicSDK.AI_PROMPT}`;

  console.log(`[generateGuide] Sending assembled context to Claude...`);
  const response = await client.complete({
    prompt,
    model: "claude-2.1",
    max_tokens_to_sample: 1500,
    stop_sequences: [AnthropicSDK.HUMAN_PROMPT],
    temperature: 0.0,
  });

  console.log(`[generateGuide] Received response from Claude.`);
  return response.completion.trim();
}
