# src/cli/scripted-mode.ts - Scripted Session Mode

**Role:** Builds the deterministic `--script` `CliSessionMode` used by eval subprocesses and non-interactive runs — reads inputs and tool-approval choices from a file instead of a live TTY. Split out of `session-modes.ts` at the 500-line limit as the self-contained non-interactive counterpart to `createInteractiveMode`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createScriptedMode(scriptPath: string): CliSessionMode
```
<!-- END GENERATED EXPORTS -->

## Behavior

- Reads the script file once, trimming trailing whitespace and dropping empty lines. A line starting with `"` is JSON-decoded, so a quoted string can carry a multi-line message as one input.
- Tool approval consumes the next line only if it parses as a choice (`y/yes/approve/a` or `n/no/deny/d`, via `parseScriptedToolChoice`); otherwise the call is denied.
- If a denial has a following line, that line is forwarded as the user's instruction after denial.
- `/eval` prints that the menu is unavailable instead of opening it.
- Under `FREECODE_AUTO_CONFIRM=1` (eval subprocesses) every call is auto-approved until `FREECODE_MAX_TOOL_CALLS` is exceeded, after which calls are silently denied — a hard budget for unattended runs, no prompt (scripted stdin is closed).
- On EOF, prints `Goodbye!` unless `FREECODE_AUTO_CONFIRM=1`.

## Read When

- Changing how `--script` runs consume input or approve tools, or how eval subprocesses are driven unattended.

## Key Neighbors

- [session-modes.md](session-modes.md) — the interactive counterpart; both build a `CliSessionMode` for `session-runner.ts`.
- [tools/tool-approval.md](tools/tool-approval.md) — `formatScriptedToolMenu` / `parseScriptedToolChoice`.
- `../index.ts` — selects this mode for `--script` runs.
