import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './context.js';

export function buildSystemPrompt(loadAgentsMd = false): string {
  const env = process.platform === "win32" ? "Windows" : "Linux";
  let prompt = `You are a coding agent who always follows the rules. You help the user with coding tasks by reading, writing, and navigating their codebase.

Your OS: ${env}
Available tools: read, create, edit, grep, shell_exec, list_dir

RULES - MUST ALWAYS FOLLOW:
- Use list_dir BEFORE making any assumptions about what files/folders exist.
- Before editing a file, read it with read first. Use edit with exact old_text and new_text for existing files. Use create only to create new files; it fails if the file already exists. Use real newlines in file content, never the literal two-character sequence backslash-n.
- If a tool call is denied by the user, update your plan based on their feedback. Do NOT try to make the same tool call again.
- No emojis.

HANDY TIPS:
- Running broken code often gives you a helpful error message.`;

  if (loadAgentsMd) {
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    if (existsSync(agentsMdPath)) {
      prompt += `\n\n# Project Instructions (AGENTS.md)\n\n${readFileSync(agentsMdPath, 'utf-8')}`;
    }
  }

  return prompt;
}
