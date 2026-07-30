import { existsSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './workspace.js';
import { readTextFile } from '../util/text-encoding.js';
import { isWriteTool, offeredToolNames } from './tools/tool-names.js';

// `toolNames` must be exactly what the caller put in the tool set — use
// `offeredToolNames` with the same flags. Advertising a tool that is absent sends
// the model off calling something that does not exist: the prompt-based tool
// protocol (agent/parsed-tools.ts) has no spawn_agent, and a read-only session
// (the Ctrl+R toggle, `freecode -p`) has no create/edit/shell_exec.
export function buildSystemPrompt(
  loadAgentsMd = false,
  toolNames: readonly string[] = offeredToolNames({ spawnAgent: true }),
): string {
  const env = process.platform === "win32" ? "Windows" : "Linux";
  const hasSpawnAgent = toolNames.includes("spawn_agent");
  const canWrite = toolNames.some(isWriteTool);
  let prompt = `You are a coding agent who always follows the rules. You help the user with coding tasks by reading, writing, and navigating their codebase.

Your OS: ${env}
Available tools: ${toolNames.join(", ")}

RULES - MUST ALWAYS FOLLOW${canWrite ? `
- Before editing a file, read it with read first. Use edit with exact old_text and new_text for existing files. Use create only to create new files; it fails if the file already exists. Use real newlines in file content, never the literal two-character sequence backslash-n.` : `
- This session is read-only: the tools above are all you have. You cannot create or edit files or run commands, so do not offer to — answer from what you can read.`}
- If a tool call is denied by the user, update your plan based on their feedback. Do NOT try to make the same tool call again.
- No emojis.`;

  // Each tip is about a tool, so a tip for a tool the caller did not offer is
  // noise at best — "run it and read the error" contradicts a read-only session.
  const tips = [
    ...(canWrite ? ['Running broken code often gives you a helpful error message.'] : []),
    ...(hasSpawnAgent ? ['For a large read-only investigation, call spawn_agent to delegate it to a sub-agent; it reads many files and returns a compact findings report, keeping your own context small.'] : []),
  ];
  if (tips.length > 0) {
    prompt += `\n\nHANDY TIPS:\n${tips.map(tip => `- ${tip}`).join('\n')}`;
  }

  if (loadAgentsMd) {
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    if (existsSync(agentsMdPath)) {
      prompt += `\n\n# Project Instructions (AGENTS.md)\n\n${readTextFile(agentsMdPath)}`;
    }
  }

  return prompt;
}
