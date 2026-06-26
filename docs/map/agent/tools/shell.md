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
- Returns stdout plus stderr when present.
- Returns `Command completed with no output` for empty success.
- Returns an error string for failed/timeout execution.
