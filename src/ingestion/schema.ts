import { z } from 'zod';

export const chunkSchema = z.object({
  repo: z.string(),
  filePath: z.string(),
  startLine: z.number().int().positive(),
  text: z.string(),
  source: z.enum(['code', 'confluence', 'pr', 'github']),
  commitSha: z.string().optional(),
});

export const chunksSchema = z.array(chunkSchema);

export type Chunk = z.infer<typeof chunkSchema>;
