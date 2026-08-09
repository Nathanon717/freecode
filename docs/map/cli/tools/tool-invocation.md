# src/cli/tools/tool-invocation.ts - Hand-Typed Tool Call Parsing

**Role:** Pure parsing/highlighting for user-typed tool calls of the form `name(arg=val, ...)`. Deliberately free of any `ai`-SDK import so it is safe to load on the early interactive boot path; execution lives in [tool-runner.md](./tool-runner.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
TOOL_NAMES: readonly ["read", "grep", "list_dir", "create", "edit", "shell_exec"]

isToolName: (name: string) => name is "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir"

ToolName: any

interface ToolParam {
  name: string;
  // String-typed params get autofilled with empty quotes (`key=""`); everything
  // else (numbers, booleans) autofills bare (`key=`).
  quoted: boolean;
}

TOOL_PARAMS: Record<'create' | 'edit' | 'shell_exec' | 'read' | 'grep' | 'list_dir', readonly ToolParam[]>

buildToolCallSkeleton(name: "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir"): { text: string; caret: number; }

interface HighlightRange {
  start: number;
  end: number;
}

toolNameHighlightRanges(line: string): HighlightRange[]

toolNameBeforeCursor(buffer: string, cursor: number): "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir" | null

styleToolNames(chunk: string, chunkStart: number, ranges: HighlightRange[]): string

interface ParsedInvocation {
  name: ToolName;
  args: Record<string, unknown>;
}

parseToolInvocation(input: string): ParsedInvocation | null

interface FieldSlot {
  key: string;
  rawValue: string; // trimmed value text as typed, quotes included; '' if empty
  quoted: boolean;
  hasEq: boolean;
  partStart: number;
  partEnd: number;
  valStart: number;
  valEnd: number;
}

toolCallSlots(buffer: string): FieldSlot[] | null

nextToolFieldCaret(buffer: string, cursor: number): number | null

toolFieldBackspace(buffer: string, cursor: number): number | "block" | null

stripEmptyToolArgs(input: string): string

parseToolArgs(argsText: string): Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/tool-names.ts`](../../agent/tools/tool-names.md) ×9, [`cli/theme.ts`](../theme.md) ×1
- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×5, [`cli/tools/tool-runner.ts`](tool-runner.md) ×4, [`cli/chrome/bottom-ui.ts`](../chrome/bottom-ui.md) ×2, [`cli/command-dispatcher.ts`](../command-dispatcher.md) ×1

## Tests

`tests/cli/tools/tool-invocation.test.ts`. 1 other test file references it.

## Budget

323 / 500 lines (177 to spare).
<!-- END GENERATED MAP FACTS -->

## Read When

- Changing the tool-call typing syntax, argument coercion, the autofill skeleton, tabstop navigation, or the pastel tool-name highlight.
- Adding/removing a callable tool — update `TOOL_PARAMS` here. `TOOL_NAMES` needs nothing: it comes from the registry's name module.

## Export notes

- `TOOL_NAMES` / `isToolName` — re-exported from [../../agent/tools/tool-names.md](../../agent/tools/tool-names.md), not restated here, so there is nothing to keep in sync. That module has no imports, which is what makes it safe on this path (this file must stay off the `ai` SDK's graph).
- `TOOL_PARAMS` — ordered param list + string-ness per tool, hardcoded to stay off the `ai`-SDK boot path. A drift-guard test in [tool-runner.md](./tool-runner.md) asserts it still matches each tool's real zod schema.
- `buildToolCallSkeleton(name)` — the `(arg=val, ...)` autofill text + caret offset inserted when `(` is typed after a tool name (strings get `key=""`, others `key=`); consumed by [session-modes.md](../session-modes.md).
- `nextToolFieldCaret` / `toolFieldBackspace` — Tab cycles forward through value slots; Backspace at an emptied slot steps back instead of eating the skeleton. Both derive from the single field-slot walker (`FieldSlot` / `toolCallSlots`), which also backs argument parsing — one grammar, no drift on quoted commas/`=`.
- `stripEmptyToolArgs(input)` — on submit, drops autofilled-but-untouched args (`key=`, `key=""`) so tabbed-past optionals are omitted.
- `toolNameHighlightRanges(line)` / `styleToolNames(chunk, chunkStart, ranges)` — locate a leading tool name immediately followed by `(` and tint it pastel per rendered chunk; consumed by [bottom-ui.md](../chrome/bottom-ui.md).
- `toolNameBeforeCursor(buffer, cursor)` — gates the autofill-on-`(` affordance in [session-modes.md](../session-modes.md) to genuine tool calls.
- `parseToolInvocation(input)` — whole-line `name(args)` → `{name, args}` or null (falls through to the agent). Never throws; args are best-effort.
- Argument values coerce as: quoted → literal string, else JSON when it parses, else the bare string.

## Key Neighbors

- [tool-runner.md](./tool-runner.md) — executes what this parses; owns `/tools` listing.
- [bottom-ui.md](../chrome/bottom-ui.md) — highlighter consumer.
- [session-modes.md](../session-modes.md) — auto-close consumer.
- [command-dispatcher.md](../command-dispatcher.md) — calls `parseToolInvocation` before falling back to the agent.

## Update Triggers

Update when the invocation syntax, argument coercion rules, or the tool name set change.
