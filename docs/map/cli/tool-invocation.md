# src/cli/tool-invocation.ts - Hand-Typed Tool Call Parsing

**Role:** Pure parsing/highlighting for user-typed tool calls of the form `name(arg=val, ...)`. Deliberately free of any `ai`-SDK import so it is safe to load on the early interactive boot path; execution lives in [tool-runner.md](tool-runner.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
TOOL_NAMES: readonly ['read', 'grep', 'list_dir', 'create', 'edit', 'shell_exec']

type ToolName = (typeof TOOL_NAMES)[number];

isToolName(name: string): name is "read" | "grep" | "list_dir" | "create" | "edit" | "shell_exec"

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

parseToolArgs(argsText: string): Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Changing the tool-call typing syntax, argument coercion, or the pastel tool-name highlight.
- Adding/removing a callable tool — update `TOOL_NAMES` here to match `createTools()` in [../agent/tools/index.md](../agent/tools/index.md).

## Export notes

- `TOOL_NAMES` / `isToolName` — canonical set of directly-invokable tools; mirror the tool registry.
- `toolNameHighlightRanges(line)` / `styleToolNames(chunk, chunkStart, ranges)` — locate a leading tool name immediately followed by `(` and tint it pastel per rendered chunk; consumed by [terminal-ui.md](terminal-ui.md).
- `toolNameBeforeCursor(buffer, cursor)` — gates the auto-closing `(`→`()` affordance in [session-modes.md](session-modes.md) to genuine tool calls.
- `parseToolInvocation(input)` — whole-line `name(args)` → `{name, args}` or null (falls through to the agent). Never throws; args are best-effort.
- Argument values coerce as: quoted → literal string, else JSON when it parses, else the bare string.

## Key Neighbors

- [tool-runner.md](tool-runner.md) — executes what this parses; owns `/tools` listing.
- [terminal-ui.md](terminal-ui.md) — highlighter consumer.
- [session-modes.md](session-modes.md) — auto-close consumer.
- [command-dispatcher.md](command-dispatcher.md) — calls `parseToolInvocation` before falling back to the agent.

## Update Triggers

Update when the invocation syntax, argument coercion rules, or the tool name set change.
