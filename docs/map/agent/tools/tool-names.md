# src/agent/tools/tool-names.ts - Tool Name Partition

**Role:** The tool registry's names, split into the read-only half and the write half, plus the predicates and the `offeredToolNames` list built from them. Single source for "which tools can change anything".

**Read when:** adding or removing a tool; changing what read-only mode offers; touching the system prompt's tool list.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
READ_ONLY_TOOL_NAMES: readonly ['read', 'grep', 'list_dir']

WRITE_TOOL_NAMES: readonly ['create', 'edit', 'shell_exec']

TOOL_NAMES: readonly ['read', 'grep', 'list_dir', 'create', 'edit', 'shell_exec']

type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

type ToolName = (typeof TOOL_NAMES)[number];

isReadOnlyTool(name: string): name is "read" | "grep" | "list_dir"

isWriteTool(name: string): name is "create" | "edit" | "shell_exec"

isToolName(name: string): name is "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir"

offeredToolNames(options: { readOnly?: boolean | undefined; spawnAgent?: boolean | undefined; }): readonly string[]
```
<!-- END GENERATED EXPORTS -->

## Why it is separate from the registry

**No imports, deliberately.** Two consumers cannot afford the tool registry's module
graph: `cli/tools/tool-invocation.ts` (the hand-typed call parser, loaded by the
bottom UI on the interactive boot path) and `agent/system-prompt.ts` (reached from
`tokenizers/chat-format.ts`, also on that path). Importing
[index.md](index.md) for the same names drags in the `ai` SDK via
`tools/spawn-agent.ts` — about 1.2s of startup, which `src/index.ts` goes to
lengths to defer.

So the names are stated here and the name → tool maps stay in
[index.md](index.md). `tests/agent/tools/index.test.ts` pins the two together:
`Object.keys(READ_ONLY_TOOL_DEFS)` must equal `READ_ONLY_TOOL_NAMES`, and
`offeredToolNames` must equal `Object.keys(createTools(...))` for every combination
of the `readOnly` / `spawnAgent` flags.

## Who derives from this

- `agent/tools/index.ts` — `isReadOnlyTool` gates precomputing a result before the
  user confirms (a read-only action is safe to run early, by definition).
- `cli/session-modes.ts` — `isWriteTool` for the mid-turn read-only denial,
  `isReadOnlyTool` for the auto-approve token budget.
- `agent/system-prompt.ts` — `offeredToolNames` states the prompt's tool list. Not
  cosmetic: a prompt advertising `edit` to a read-only session sends the model
  calling a tool that is not there.
- `cli/tools/tool-invocation.ts` — re-exports `TOOL_NAMES` / `isToolName`.

## Update triggers

- A tool is added or removed, or moves between the halves.
- `createTools` changes which tools it offers for a given flag combination —
  `offeredToolNames` must move with it or the drift test fails.
