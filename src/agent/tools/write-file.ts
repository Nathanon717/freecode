import { tool } from 'ai';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { projectRoot } from '../context.js';

export const writeFileTool = tool({
  description: 'Create a new file at the given path. Fails if the file already exists. Use edit_file for existing files.',
  parameters: z.object({
    path: z.string().describe('Relative path from project root'),
    content: z.string().describe('The complete content to write to the file'),
  }),
  execute: async ({ path, content }) => {
    const fullPath = join(projectRoot, path);
    try {
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });
      // Some models double-escape newlines/tabs in tool call arguments
      const normalized = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      await writeFile(fullPath, normalized, { encoding: 'utf-8', flag: 'wx' });
      return `Wrote ${normalized.length} bytes to ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error writing file: ${error.message}`;
      }
      return 'Error writing file: unknown error';
    }
  },
});
