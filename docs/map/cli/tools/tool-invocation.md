# src/cli/tools/tool-invocation.ts - Hand-Typed Tool Call Parsing

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure parsing/highlighting for user-typed tool calls of the form `name(arg=val, ...)`. Deliberately free of any `ai`-SDK import so it is safe to load on the early interactive boot path; execution lives in [tool-runner.md](./tool-runner.md).

## Read When

- Changing the tool-call typing syntax, argument coercion, the autofill skeleton, tabstop navigation, or the pastel tool-name highlight.
- Adding/removing a callable tool — update `TOOL_PARAMS` here. `TOOL_NAMES` needs nothing: it comes from the registry's name module.
<!-- END GENERATED MAP INTENT -->

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

/**
 * Ordered parameter list per tool, used to autofill the argument skeleton when
 * a tool call is opened. Mirrors each tool's zod schema in src/agent/tools/ —
 * order, names, and string-ness must match. A drift guard test in
 * tests/cli/tool-runner.test.ts checks this against the real schemas.
 *
 * Hardcoded rather than derived from the schemas so this file stays off the
 * `ai` SDK's boot path — the same reason `TOOL_NAMES` / `isToolName` come from
 * `agent/tools/tool-names.ts`, which has no imports of its own.
 */
TOOL_PARAMS: Record<'create' | 'edit' | 'shell_exec' | 'read' | 'grep' | 'list_dir', readonly ToolParam[]>

/**
 * The `(arg=val, ...)` text to insert after a freshly-typed tool name, plus the
 * caret offset (into that text) at which the cursor should land — inside the
 * first param's value slot, i.e. between the quotes of `path=""` or right after
 * the `=` of a bare param. Tab/Backspace then move between slots.
 */
buildToolCallSkeleton(name: "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir"): { text: string; caret: number; }

interface HighlightRange {
  start: number;
  end: number;
}

/**
 * Char ranges within `line` naming a valid tool that is the leading token of
 * the line and is immediately followed by `(`. Used to paint the tool name a
 * pastel colour while the user types; args and parens stay the default colour.
 */
toolNameHighlightRanges(line: string): HighlightRange[]

/**
 * The identifier ending exactly at `cursor`, returned only when it is a valid
 * tool name and the leading token of its logical line. Drives the auto-closing
 * `(` → `()` affordance so it fires only for a genuine tool call.
 */
toolNameBeforeCursor(buffer: string, cursor: number): "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir" | null

/**
 * Applies theme.toolName to the portions of a rendered chunk that fall within
 * `ranges` (absolute char offsets in the logical line). Colouring per-chunk —
 * after the caller's visual-width slicing — keeps wrap math on raw char counts.
 */
styleToolNames(chunk: string, chunkStart: number, ranges: HighlightRange[]): string

interface ParsedInvocation {
  name: ToolName;
  args: Record<string, unknown>;
}

/**
 * Parses a whole input line of the form `name(arg=val, ...)`. Returns null when
 * the line is not a complete, valid tool invocation so it falls through to the
 * agent. Never throws — malformed args yield a best-effort object.
 */
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

/**
 * The field slots of a whole-buffer tool-call template (leading whitespace, a
 * valid tool name, `(`, args, `)`, trailing whitespace), with positions shifted
 * into absolute buffer offsets. Null when the buffer is not such a template, so
 * callers fall back to their normal editing behaviour. The single field-slot
 * walker: Tab/Backspace navigation and argument parsing both derive from it, so
 * one grammar governs quoted commas and `=` with no drift between them.
 */
toolCallSlots(buffer: string): FieldSlot[] | null

/**
 * Cyclic Tab target: the value slot after the one the cursor sits in (or the
 * first slot when the cursor is outside any slot). Returns null when the buffer
 * is not a tool call or has no fields, so Tab falls back to command completion.
 */
nextToolFieldCaret(buffer: string, cursor: number): number | null

/**
 * Backspace at an emptied value slot: navigate rather than eat the skeleton.
 *  - number → move the caret to the previous slot's value (append point);
 *  - 'block' → the first slot is empty, swallow the keypress (skeleton stays);
 *  - null → not at an empty slot start, so do a normal backspace.
 */
toolFieldBackspace(buffer: string, cursor: number): number | "block" | null

/**
 * Drops autofilled-but-untouched args (`key=`, `key=""`) from a submitted tool
 * call so tabbed-past optional params are simply omitted. Leaves non-tool input
 * and already-clean calls untouched.
 */
stripEmptyToolArgs(input: string): string

/**
 * Values coerce as: quoted → the literal string, else JSON when it parses, else
 * the bare string.
 */
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

357 / 500 lines (143 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [tool-runner.md](./tool-runner.md) — executes what this parses; owns `/tools` listing.
- [bottom-ui.md](../chrome/bottom-ui.md) — highlighter consumer.
- [session-modes.md](../session-modes.md) — auto-close consumer.
- [command-dispatcher.md](../command-dispatcher.md) — calls `parseToolInvocation` before falling back to the agent.

## Update Triggers

Update when the invocation syntax, argument coercion rules, or the tool name set change.
