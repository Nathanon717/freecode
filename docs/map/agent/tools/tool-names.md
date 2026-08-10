# src/agent/tools/tool-names.ts - Tool Name Partition

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The tool registry's names, split into the read-only half and the write half, plus the predicates and the `offeredToolNames` list built from them. Single source for "which tools can change anything".

## Read When

adding or removing a tool; changing what read-only mode offers; touching the system prompt's tool list.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
READ_ONLY_TOOL_NAMES: readonly ['read', 'grep', 'list_dir']

WRITE_TOOL_NAMES: readonly ['create', 'edit', 'shell_exec']

/**
 * Every directly-invokable tool, read-only half first. Order is display order.
 */
TOOL_NAMES: readonly ['read', 'grep', 'list_dir', 'create', 'edit', 'shell_exec']

type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

type ToolName = (typeof TOOL_NAMES)[number];

/**
 * A read-only tool only reads: safe to offer in read-only mode, and safe to run
 * before the user confirms the call (see withConfirmation in tools/index.ts).
 */
isReadOnlyTool(name: string): name is "read" | "grep" | "list_dir"

/**
 * A write tool changes files or runs commands; denied in read-only mode.
 */
isWriteTool(name: string): name is "create" | "edit" | "shell_exec"

isToolName(name: string): name is "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir"

/**
 * The tool names `createTools` offers for the same flags, in the same order. The
 * system prompt needs this list without loading the tools themselves (via
 * tokenizers/chat-format.ts it is on the interactive boot path), so it is stated
 * here rather than read off the registry — a unit test pins the two together.
 *
 * Getting it wrong is not cosmetic: a prompt that advertises `edit` to a read-only
 * session sends the model off calling a tool that is not there.
 */
offeredToolNames(options: { readOnly?: boolean | undefined; spawnAgent?: boolean | undefined; }): readonly string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/tools/tool-invocation.ts`](../../cli/tools/tool-invocation.md) ×9, [`agent/loop.ts`](../loop.md) ×2, [`agent/system-prompt.ts`](../system-prompt.md) ×2, [`agent/tools/index.ts`](index.md) ×2, [`cli/session-modes.ts`](../../cli/session-modes.md) ×2, [`agent/tools/wrappers.ts`](wrappers.md) ×1

## Tests

`tests/agent/tools/tool-names.test.ts`. 2 other test files reference it.

## Budget

64 / 500 lines (436 to spare).
<!-- END GENERATED MAP FACTS -->

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

- The drift test — `createTools` changing which tools it offers for a given flag
  combination must move `offeredToolNames` with it, or the test fails.
