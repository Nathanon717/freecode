import { tool } from 'ai';
import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { resolveExistingProjectPath } from '../context.js';

export const listDirTool = tool({
  description: 'List files in a directory. Use this to explore project structure.',
  parameters: z.object({
    path: z.string().optional().describe('Relative path from project root (default: .)'),
  }),
  execute: async ({ path = '.' }) => {
    let resolved;
    try {
      const targetPath = path.trim() === '' ? '.' : path;
      resolved = await resolveExistingProjectPath(targetPath);
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
      const entries = await readdir(resolved.fullPath);
      const stats = await Promise.all(
        entries.map(async (name) => {
          try {
            const s = await stat(join(resolved.fullPath, name));
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
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
