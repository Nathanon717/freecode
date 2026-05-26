import { tool } from 'ai';
import { z } from 'zod';
import { readFile, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { markFileRead, projectRoot } from '../context.js';

const DEFAULT_LIMIT = 2000;

async function suggestSimilar(fullPath: string): Promise<string> {
  const dir = dirname(fullPath);
  const base = basename(fullPath).toLowerCase();
  try {
    const entries = await readdir(dir);
    const matches = entries
      .filter((e) => {
        const el = e.toLowerCase();
        return el.includes(base) || (base.includes(el) && el.length >= 3);
      })
      .slice(0, 3);
    if (matches.length > 0) {
      return `File not found: ${fullPath}\n\nDid you mean one of these?\n${matches.map((m) => join(dir, m)).join('\n')}`;
    }
  } catch {
    // directory unreadable — fall through
  }
  return `File not found: ${fullPath}`;
}

export const readFileTool = tool({
  description:
    'Read the contents of a file at the given path. Supports line-based pagination via offset and limit. Use this to examine source code, configs, etc.',
  parameters: z.object({
    path: z.string().describe('Relative path from project root'),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-indexed line number to start reading from (default: 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(`Maximum number of lines to return (default: ${DEFAULT_LIMIT})`),
  }),
  execute: async ({ path, offset = 1, limit = DEFAULT_LIMIT }) => {
    const fullPath = join(projectRoot, path);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return suggestSimilar(fullPath);
      }
      return `Error reading file: ${error instanceof Error ? error.message : 'unknown error'}`;
    }

    markFileRead(path);

    const allLines = content.endsWith('\n')
      ? content.slice(0, -1).split('\n')
      : content.split('\n');
    const totalLines = allLines.length;
    const start = offset - 1; // convert to 0-indexed
    const sliced = allLines.slice(start, start + limit);
    const lastLine = start + sliced.length;
    const hasMore = lastLine < totalLines;

    let output = sliced.map((line, i) => `${start + i + 1}: ${line}`).join('\n');

    if (hasMore) {
      output += `\n\n(Showing lines ${offset}-${lastLine} of ${totalLines}. Use offset=${lastLine + 1} to continue.)`;
    } else {
      output += `\n\n(End of file — total ${totalLines} lines.)`;
    }

    return output;
  },
});
