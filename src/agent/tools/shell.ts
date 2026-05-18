import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { projectRoot } from '../context.js';

const execAsync = promisify(exec);

const DESTRUCTIVE_PATTERNS = ['rm ', 'rm -', 'rmdir', 'del /f', 'del ', 'format', 'git push', 'git pull', 'remove-item'];

export const isDestructiveCommand = (command: string): boolean => {
  const lower = command.toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((p) => lower.includes(p));
};

export const shellTool = tool({
  description: 'Execute a shell command. Use this to run build scripts, git commands, npm install, etc.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    confirmDestructive: z.boolean().optional().describe('Set to true only if user confirmed destructive command'),
  }),
  execute: async ({ command, confirmDestructive }) => {
    if (isDestructiveCommand(command) && !confirmDestructive) {
      return 'Destructive command detected. Set confirmDestructive: true if user confirmed.';
    }
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000, cwd: projectRoot });
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += '\n[stderr]: ' + stderr;
      if (!result) return 'Command completed with no output';
      return result;
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return 'Error: unknown error';
    }
  },
});
