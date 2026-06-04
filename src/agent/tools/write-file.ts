import { tool } from 'ai';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { resolveProjectPath, resolveWritableProjectPath } from '../context.js';

export const writeFileTool = tool({
  description: 'Create a new file at the given path. Fails if the file already exists. Use edit_file for existing files.',
  parameters: z.object({
    path: z.string().describe('Relative path from project root'),
    content: z.string().describe('The complete content to write to the file'),
  }),
  execute: async ({ path, content }) => {
    let resolved;
    try {
      resolved = resolveProjectPath(path);
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
      const dir = dirname(resolved.fullPath);
      await mkdir(dir, { recursive: true });
      resolved = await resolveWritableProjectPath(path);
      // Some models double-escape newlines/tabs in tool call arguments
      const normalized = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      await writeFile(resolved.fullPath, normalized, { encoding: 'utf-8', flag: 'wx' });
      return `Wrote ${normalized.length} bytes to ${resolved.relativePath}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
