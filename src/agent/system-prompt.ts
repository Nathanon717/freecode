import { existsSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './workspace.js';
import { readTextFile } from '../util/text-encoding.js';

// `spawnAgent` must mirror whether the caller actually put spawn_agent in the
// tool set. The prompt-based tool protocol (agent/parsed-tools.ts) does not offer
// it, so advertising it there tells the model to call a tool that does not exist.
export function buildSystemPrompt(loadAgentsMd = false, spawnAgent = true): string {
  const env = process.platform === "win32" ? "Windows" : "Linux";
  let prompt = `You are a coding agent who always follows the rules. You help the user with coding tasks by reading, writing, and navigating their codebase.

Your OS: ${env}
Available tools: read, create, edit, grep, shell_exec, list_dir${spawnAgent ? ', spawn_agent' : ''}

RULES - MUST ALWAYS FOLLOW
- Before editing a file, read it with read first. Use edit with exact old_text and new_text for existing files. Use create only to create new files; it fails if the file already exists. Use real newlines in file content, never the literal two-character sequence backslash-n.
- If a tool call is denied by the user, update your plan based on their feedback. Do NOT try to make the same tool call again.
- No emojis.

HANDY TIPS:
- Running broken code often gives you a helpful error message.${spawnAgent ? `
- For a large read-only investigation, call spawn_agent to delegate it to a sub-agent; it reads many files and returns a compact findings report, keeping your own context small.` : ''}`;

  if (loadAgentsMd) {
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    if (existsSync(agentsMdPath)) {
      prompt += `\n\n# Project Instructions (AGENTS.md)\n\n${readTextFile(agentsMdPath)}`;
    }
  }

  return prompt;
}
