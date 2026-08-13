# src/agent/tools/shell.ts - shell_exec Tool

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Executes shell commands through the Docker containment boundary, preserving output/status reporting while refusing guarded `.git` and destructive command shapes.

## Read When

- Changing the regex-based destructive-command guard (rm, git push, del patterns) in `isDestructiveCommand`, or debugging a command refused outright as a `.git` write — that block is unconditional and lives in [git-guard.md](git-guard.md).
- Changing containment, image selection, or the child environment — those live in [container-shell.md](container-shell.md).
- Debugging shell output truncation or elision, where head+tail windows and the 10 MB cap interact, or extending how exit statuses, timeouts, and maxBuffer failures are surfaced in the composed tool result.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isDestructiveCommand(command: string): boolean

shellTool: CoreTool<z.ZodObject<{ command: z.ZodString; timeout_ms: z.ZodOptional<z.ZodNumber>; confirmDestructive: z.ZodOptional<z.ZodBoolean>; }, 'strip', z.ZodTypeAny, { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }, { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }>, string> & { execute: (args: { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/git-guard.ts`](git-guard.md) ×2, [`agent/tools/container-shell.ts`](container-shell.md) ×1, [`agent/workspace.ts`](../workspace.md) ×1
- **Imported by:** [`agent/tools/index.ts`](index.md) ×1

## Tests

`tests/agent/tools/shell.test.ts`. 1 other test file references it.

## Budget

136 / 500 lines (364 to spare).
<!-- END GENERATED MAP FACTS -->

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | `string` | required | Linux shell command passed to the warm Docker executor. |
| `timeout_ms` | `number` | `30000` | Maximum command runtime in milliseconds. |
| `confirmDestructive` | `boolean` | `false` | Must be true for commands matching destructive patterns. |

## Destructive Patterns

The guard checks command text with word-boundary regexes for:

```text
rm
rmdir
del /f
format <drive>:
git push
git pull
git reset
git clean
move-item
remove-item
set-content
new-item
ren / rename
```

## Behavior

- Refuses before anything else when the command would write to or delete something under
  `.git` — see [git-guard.md](git-guard.md). That block is checked *before* the destructive
  patterns below because it must not be satisfiable by `confirmDestructive`.
- Runs through [container-shell.md](container-shell.md), in Linux at `/work`; output paths are
  translated back to the host project root before the model sees them.
- Passes none of freecode's host environment. `FREECODE_SANDBOXED=1` is the sole explicit child
  variable, retaining R1's refusal for development checkouts containing their own built CLI.
- Uses `timeout_ms` when provided, otherwise a 30-second timeout.
- Raises `maxBuffer` to 10 MB. `exec`'s own 1 MB default kills the child and
  discards its output, which a real `dotnet build` or `npm test` trips.
- Caps the result handed to the model at 100k characters — a 60k head plus a 40k
  tail, since a failing build puts its first diagnostics at the top and its
  summary at the bottom. Capturing 10 MB is not the same as sending it. The
  elision is always stated (`[... N characters elided ...]`), and the status
  line is appended *after* elision so it can never be what gets dropped.

## Result Format

The result is the command's own bytes and nothing else, plus a trailing status
line **only when the status is not already implied by those bytes**. Exit status
is not in the output — `dotnet build` prints errors to stdout and exits 1, while
plenty of commands print alarming text and exit 0 — so it has to be carried
separately or the model cannot tell success from failure.

| Case | Result |
|------|--------|
| Exit 0 with output | stdout, plus `[stderr]: <stderr>` on its own line when stderr is non-empty. No status line. |
| Exit 0, no output | `[exit 0, no output]` — a bare empty string would be ambiguous with a failure that printed nothing. |
| Non-zero exit | stdout and stderr as above, then `[exit <code>]`. |
| Timeout | partial output, then `[timed out after <ms>ms: ...]`. |
| `maxBuffer` exceeded | truncated output, then `[output exceeded <n> bytes: ...]`. |
| Shell never ran the command | `[command did not run: <message>]`. |

Do not return a paraphrase in place of the output. The one non-output result is
the `confirmDestructive` refusal, which is a refusal rather than a command
result.

**The failure path must read `error.stdout`, not `error.message`.** `exec`
folds stderr into `error.message` but leaves stdout only on `error.stdout`, so a
catch block that returns `message` alone silently drops everything a
stdout-reporting build tool said — see `docs/bug log/05-08-2026c.md`. Covered by
`tests/agent/tools/shell.test.ts` and `tests/e2e/shell-failure-output.e2e.json`.

Docker exec hands back two separate buffers, so true stdout/stderr interleaving is
not recoverable here; only a pty would preserve it.
