import { tool } from "ai";
import { z } from "zod";
import { agentCatalog, listAgentNames } from "../subagents/registry.js";

/** Bound in agent/loop.ts where the model handle lives; injected into createTools. */
export type SpawnAgentFn = (agentType: string, prompt: string) => Promise<string>;

// Unlike the other tools this is a factory, not a static export: spawn_agent needs
// a model handle to run its sub-turn, and a tool's execute never receives one. The
// caller (createTools) is handed a pre-bound spawnAgent closure and wraps it here.
export function makeSpawnAgentTool(spawnAgent: SpawnAgentFn) {
  const names = listAgentNames() as [string, ...string[]];
  return tool({
    description:
      "Delegate a focused, read-only investigation to a specialized sub-agent that runs " +
      "with its own system prompt and returns a compact findings report. Use this to explore " +
      "the codebase without spending your own context on the search: the sub-agent reads many " +
      "files and returns only its conclusions. The sub-agent has read-only tools (read, grep, " +
      "list_dir), cannot modify files, and cannot spawn further agents. " +
      `Available agents: ${agentCatalog()}.`,
    parameters: z.object({
      agentType: z.enum(names).describe("Which sub-agent persona to run."),
      prompt: z
        .string()
        .describe(
          "The task for the sub-agent. Be specific about what to find and what to report back.",
        ),
    }),
    execute: async ({
      agentType,
      prompt,
    }: {
      agentType: string;
      prompt: string;
    }): Promise<string> => spawnAgent(agentType, prompt),
  });
}
