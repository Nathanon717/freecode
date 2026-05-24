import { tool } from 'ai';
import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { hasFileBeenRead, projectRoot } from '../context.js';

function normalizeToolText(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export const editFileTool = tool({
  description: 'Edit a file by replacing one exact old_text occurrence with new_text. Use this for small targeted edits.',
  parameters: z.object({
    path: z.string().describe('Relative path from project root'),
    old_text: z.string().describe('Exact text to replace; must appear exactly once in the file'),
    new_text: z.string().describe('Replacement text'),
  }),
  execute: async ({ path, old_text, new_text }) => {
    const fullPath = join(projectRoot, path);
    const normalizedOldText = normalizeToolText(old_text);
    const normalizedNewText = normalizeToolText(new_text);

    if (normalizedOldText.length === 0) {
      return 'Error editing file: old_text must not be empty';
    }

    if (!hasFileBeenRead(path)) {
      return `Error editing file: ${path} must be read first`;
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      const firstIndex = content.indexOf(normalizedOldText);

      if (firstIndex === -1) {
        return `Error editing file: old_text not found in ${path}`;
      }

      const secondIndex = content.indexOf(normalizedOldText, firstIndex + normalizedOldText.length);
      if (secondIndex !== -1) {
        return `Error editing file: old_text appears multiple times in ${path}`;
      }

      const updated = content.slice(0, firstIndex) + normalizedNewText + content.slice(firstIndex + normalizedOldText.length);
      await writeFile(fullPath, updated, 'utf-8');

      return `Edited ${path}: replaced ${normalizedOldText.length} bytes with ${normalizedNewText.length} bytes`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error editing file: ${error.message}`;
      }
      return 'Error editing file: unknown error';
    }
  },
});
