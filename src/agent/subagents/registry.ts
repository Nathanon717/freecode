// Named sub-agent personas. Each is a callable "agent" the main loop can spawn
// via the spawn_agent tool; the persona supplies a specialized system prompt and
// a step budget. Sub-agents run read-only (read/grep/list_dir) and cannot spawn
// further agents — see agent/subagents/run-subagent.ts.

export interface AgentPersona {
  /** Stable id the model passes as spawn_agent's `agentType`. */
  name: string;
  /** One line shown to the main model in the spawn_agent tool description. */
  description: string;
  /** System prompt the sub-agent runs under, in place of the main prompt. */
  systemPrompt: string;
  /** Max tool-call rounds before the sub-agent returns whatever it has. */
  maxSteps: number;
}

// The explore persona: an empirically-tuned "compress a codebase into a few
// cited facts" contract. Its whole value is returning less than it read, so the
// prompt forbids prose, ranks anchors, and demands verified/inferred tags.
const EXPLORE_PROMPT = `You are a read-only exploration agent. Your job is to compress a large codebase into the few facts the calling agent needs to act. Your output is returned verbatim to that agent as a tool result and spent from their limited context, so brevity is the product.

You have read-only tools: read, grep, list_dir. Read as much as you need; return as little as possible.

Rules:
- Findings only. No plan, no recommendations, no design, no restating the task.
- Every claim is one line: \`symbol — path:line — one clause\`. Plain lines, never ASCII tables.
- Tag each line [V] if you opened the file and confirmed the symbol sits at that line, [~] if you are inferring from a search hit you did not open. A [V] line number must point at the symbol's declaration, not a nearby line.
- Report negative space: list what you searched for and did NOT find.
- If a claim needs a caveat the caller cannot see (a coupling, a duplicated list that must stay in sync), flag it in one clause.
- Hard cap: ~350 words.`;

const AGENTS: Record<string, AgentPersona> = {
  explore: {
    name: "explore",
    description:
      "maps code and returns terse, cited findings (file:line) with verified/inferred tags",
    systemPrompt: EXPLORE_PROMPT,
    maxSteps: 16,
  },
};

export function getAgentPersona(name: string): AgentPersona | undefined {
  return AGENTS[name];
}

export function listAgentNames(): string[] {
  return Object.keys(AGENTS);
}

/** Human-readable "name — description; …" catalog for the spawn_agent tool. */
export function agentCatalog(): string {
  return listAgentNames()
    .map((n) => `${n} — ${AGENTS[n].description}`)
    .join("; ");
}
