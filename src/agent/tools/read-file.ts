import { tool } from 'ai';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { markFileRead, projectRoot } from '../context.js';

export const readFileTool = tool({
  description: 'Read the contents of a file at the given path. Use this to examine source code, configs, etc.',
  parameters: z.object({
    path: z.string().describe('Relative path from project root'),
  }),
  execute: async ({ path }) => {
    const fullPath = join(projectRoot, path);
    try {
      const content = await readFile(fullPath, 'utf-8');
      markFileRead(path);
      if (content.length > 30000) {
        return content.slice(0, 30000) + '\n\n[TRUNCATED — file is ' + content.length + ' chars. Use grep to find specific content.]';
      }
      return content;
    } catch (error) {
      if (error instanceof Error) {
        return `Error reading file: ${error.message}`;
      }
      return 'Error reading file: unknown error';
    }
  },
});
