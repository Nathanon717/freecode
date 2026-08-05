# src/agent/tools/shell.ts - shell_exec Tool

**Role:** Executes shell commands in the active project root with a regex-based destructive-command guard.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isDestructiveCommand(command: string): boolean

shellTool: CoreTool<z.ZodObject<{ command: z.ZodString; timeout_ms: z.ZodOptional<z.ZodNumber>; confirmDestructive: z.ZodOptional<z.ZodBoolean>; }, 'strip', z.ZodTypeAny, { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }, { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }>, string> & { execute: (args: { command: string; timeout_ms?: number | undefined; confirmDestructive?: boolean | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | `string` | required | Command passed to `child_process.exec`. |
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

- Runs with `cwd: projectRoot`.
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

`exec` hands back two separate buffers, so true stdout/stderr interleaving is
not recoverable here; only a pty would preserve it.
