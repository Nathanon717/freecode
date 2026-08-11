/**
 * @role Creates a new UTF-8 file relative to the active project root, refusing paths inside `.git`.
 *
 * @readwhen
 * - Changing how new files are created, e.g. adding a fail-if-exists check, encoding, or error handling.
 * - Debugging why creating a file fails, reports wrong bytes written, or is refused as a `.git` write — that guard is in [git-guard.md](git-guard.md).
 * - Extending file creation to support newline/tab normalization or directory auto-creation.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { resolveProjectPath, resolveWritableProjectPath } from '../workspace.js';
import { GIT_INTERNALS_REFUSAL, isGitInternalPath } from './git-guard.js';

export const createFileTool = tool({
  description: 'Create a new file at the given path. Fails if the file already exists. Use edit for existing files.',
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
    if (isGitInternalPath(resolved.relativePath)) return GIT_INTERNALS_REFUSAL;
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
