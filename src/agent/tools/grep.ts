import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { projectRoot } from '../context.js';

const execAsync = promisify(exec);

async function execGrep(pattern: string, path: string): Promise<string> {
  const safePattern = pattern.replace(/"/g, '\\"');
  const cwd = resolve(projectRoot, path);
  const cmd = `findstr /s /n /i "${safePattern}" *`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: 10000, cwd });
    if (stdout.trim()) {
      const lines = stdout.split('\n').filter((l) => l.length > 0).slice(0, 50);
      return lines.join('\n');
    }
    return 'No matches found';
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('not recognized') || errMsg.includes('not found') || errMsg.includes('exit code 1') || errMsg.includes('Command failed')) {
      return 'No matches found';
    }
    return `Error searching: ${errMsg}`;
  }
}

export const grepTool = tool({
  description: 'Search for a pattern in files. Use this to find specific code, functions, or text across the codebase.',
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (default: current directory)'),
  }),
  execute: async ({ pattern, path = '.' }) => {
    try {
      return await execGrep(pattern, path);
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching: ${error.message}`;
      }
      return 'Error searching: unknown error';
    }
  },
});