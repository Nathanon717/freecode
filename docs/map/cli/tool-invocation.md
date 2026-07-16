# src/cli/tool-invocation.ts - Hand-Typed Tool Call Parsing

**Role:** Pure parsing/highlighting for user-typed tool calls of the form `name(arg=val, ...)`. Deliberately free of any `ai`-SDK import so it is safe to load on the early interactive boot path; execution lives in [tool-runner.md](tool-runner.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
TOOL_NAMES: readonly ['read', 'grep', 'list_dir', 'create', 'edit', 'shell_exec']

type ToolName = (typeof TOOL_NAMES)[number];

isToolName(name: string): name is "read" | "grep" | "list_dir" | "create" | "edit" | "shell_exec"

interface ToolParam {
  name: string;
  // String-typed params get autofilled with empty quotes (`key=""`); everything
  // else (numbers, booleans) autofills bare (`key=`).
  quoted: boolean;
}

TOOL_PARAMS: Record<'read' | 'grep' | 'list_dir' | 'create' | 'edit' | 'shell_exec', readonly ToolParam[]>

buildToolCallSkeleton(name: "read" | "grep" | "list_dir" | "create" | "edit" | "shell_exec"): { text: string; caret: number; }

interface HighlightRange {
  start: number;
  end: number;
}

toolNameHighlightRanges(line: string): HighlightRange[]

toolNameBeforeCursor(buffer: string, cursor: number): "read" | "grep" | "list_dir" | "create" | "edit" | "shell_exec" | null

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

## Read When

- Changing the tool-call typing syntax, argument coercion, the autofill skeleton, tabstop navigation, or the pastel tool-name highlight.
- Adding/removing a callable tool — update `TOOL_NAMES` **and** `TOOL_PARAMS` here to match `createTools()` in [../agent/tools/index.md](../agent/tools/index.md).

## Export notes

- `TOOL_NAMES` / `isToolName` — canonical set of directly-invokable tools; mirror the tool registry.
- `TOOL_PARAMS` — ordered param list + string-ness per tool, hardcoded to stay off the `ai`-SDK boot path. A drift-guard test in [tool-runner.md](tool-runner.md) asserts it still matches each tool's real zod schema.
- `buildToolCallSkeleton(name)` — the `(arg=val, ...)` autofill text + caret offset inserted when `(` is typed after a tool name (strings get `key=""`, others `key=`); consumed by [session-modes.md](session-modes.md).
- `nextToolFieldCaret` / `toolFieldBackspace` — Tab cycles forward through value slots; Backspace at an emptied slot steps back instead of eating the skeleton. Both derive from the single field-slot walker (`FieldSlot` / `toolCallSlots`), which also backs argument parsing — one grammar, no drift on quoted commas/`=`.
- `stripEmptyToolArgs(input)` — on submit, drops autofilled-but-untouched args (`key=`, `key=""`) so tabbed-past optionals are omitted.
- `toolNameHighlightRanges(line)` / `styleToolNames(chunk, chunkStart, ranges)` — locate a leading tool name immediately followed by `(` and tint it pastel per rendered chunk; consumed by [bottom-ui.md](bottom-ui.md).
- `toolNameBeforeCursor(buffer, cursor)` — gates the autofill-on-`(` affordance in [session-modes.md](session-modes.md) to genuine tool calls.
- `parseToolInvocation(input)` — whole-line `name(args)` → `{name, args}` or null (falls through to the agent). Never throws; args are best-effort.
- Argument values coerce as: quoted → literal string, else JSON when it parses, else the bare string.

## Key Neighbors

- [tool-runner.md](tool-runner.md) — executes what this parses; owns `/tools` listing.
- [bottom-ui.md](bottom-ui.md) — highlighter consumer.
- [session-modes.md](session-modes.md) — auto-close consumer.
- [command-dispatcher.md](command-dispatcher.md) — calls `parseToolInvocation` before falling back to the agent.

## Update Triggers

Update when the invocation syntax, argument coercion rules, or the tool name set change.
