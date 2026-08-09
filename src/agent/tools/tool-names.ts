/**
 * @role The tool registry's names, split into the read-only half and the write half, plus the predicates and the `offeredToolNames` list built from them. Single source for "which tools can change anything".
 *
 * @readwhen
 * adding or removing a tool; changing what read-only mode offers; touching the system prompt's tool list.
 */

// The tool registry's names, partitioned by whether a call can change anything
// outside the process.
//
// This is a deliberate leaf module: no imports at all, so the interactive boot
// path and the pure parsing/highlighting in cli/tools/tool-invocation.ts can both
// use it. Importing agent/tools/index.ts for the same names would drag in the `ai`
// SDK (via tools/spawn-agent.ts) and cost ~1.2s of startup — see src/index.ts.
//
// The actual name -> tool maps live in agent/tools/index.ts as READ_ONLY_TOOL_DEFS
// and WRITE_TOOL_DEFS; a unit test pins their keys to these lists so the two can
// never drift.

export const READ_ONLY_TOOL_NAMES = ["read", "grep", "list_dir"] as const;
export const WRITE_TOOL_NAMES = ["create", "edit", "shell_exec"] as const;

/** Every directly-invokable tool, read-only half first. Order is display order. */
export const TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  ...WRITE_TOOL_NAMES,
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export type ToolName = (typeof TOOL_NAMES)[number];

const READ_ONLY_SET = new Set<string>(READ_ONLY_TOOL_NAMES);
const WRITE_SET = new Set<string>(WRITE_TOOL_NAMES);
const TOOL_NAME_SET = new Set<string>(TOOL_NAMES);

/**
 * A read-only tool only reads: safe to offer in read-only mode, and safe to run
 * before the user confirms the call (see withConfirmation in tools/index.ts).
 */
export function isReadOnlyTool(name: string): name is ReadOnlyToolName {
  return READ_ONLY_SET.has(name);
}

/** A write tool changes files or runs commands; denied in read-only mode. */
export function isWriteTool(name: string): name is WriteToolName {
  return WRITE_SET.has(name);
}

export function isToolName(name: string): name is ToolName {
  return TOOL_NAME_SET.has(name);
}

/**
 * The tool names `createTools` offers for the same flags, in the same order. The
 * system prompt needs this list without loading the tools themselves (via
 * tokenizers/chat-format.ts it is on the interactive boot path), so it is stated
 * here rather than read off the registry — a unit test pins the two together.
 *
 * Getting it wrong is not cosmetic: a prompt that advertises `edit` to a read-only
 * session sends the model off calling a tool that is not there.
 */
export function offeredToolNames(options: {
  readOnly?: boolean;
  spawnAgent?: boolean;
}): readonly string[] {
  if (options.readOnly) return READ_ONLY_TOOL_NAMES;
  return options.spawnAgent
    ? [...READ_ONLY_TOOL_NAMES, "spawn_agent", ...WRITE_TOOL_NAMES]
    : TOOL_NAMES;
}
