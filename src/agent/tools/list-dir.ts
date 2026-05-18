import { tool } from 'ai';
import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { projectRoot } from '../context.js';

export const listDirTool = tool({
  description: 'List files in a directory. Use this to explore project structure.',
  parameters: z.object({
    path: z.string().optional().describe('Relative path from project root (default: .)'),
  }),
  execute: async ({ path = '.' }) => {
    const fullPath = join(projectRoot, path);
    try {
      const entries = await readdir(fullPath);
      const stats = await Promise.all(
        entries.map(async (name) => {
          try {
            const s = await stat(join(fullPath, name));
            return {
              name,
              isDirectory: s.isDirectory(),
              size: s.size,
            };
          } catch {
            return { name, isDirectory: false, size: 0 };
          }
        })
      );
      const dirs = stats.filter((s) => s.isDirectory).map((s) => s.name + '/').sort();
      const files = stats.filter((s) => !s.isDirectory).map((s) => s.name).sort();
      return [...dirs, ...files].join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error listing directory: ${error.message}`;
      }
      return 'Error listing directory: unknown error';
    }
  },
});