# src/cli/scripted-mode.ts - Scripted Session Mode

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Builds the deterministic `--script` `CliSessionMode` used by eval subprocesses and non-interactive runs — reads inputs and tool-approval choices from a file instead of a live TTY. Split out of `session-modes.ts` at the 500-line limit as the self-contained non-interactive counterpart to `createInteractiveMode`.

## Read When

- Changing how `--script` runs consume input or approve tools, or how eval subprocesses are driven unattended.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createScriptedMode(scriptPath: string): CliSessionMode
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/tools/tool-approval.ts`](tools/tool-approval.md) ×3, [`agent/tools/index.ts`](../agent/tools/index.md) ×1, [`cli/session-runner.ts`](session-runner.md) ×1

## Tests

`tests/cli/scripted-mode.test.ts`.

## Budget

95 / 500 lines (405 to spare).

## Env

`FREECODE_AUTO_CONFIRM`, `FREECODE_MAX_TOOL_CALLS`
<!-- END GENERATED MAP FACTS -->

## Behavior

- Reads the script file once, trimming trailing whitespace and dropping empty lines. A line starting with `"` is JSON-decoded, so a quoted string can carry a multi-line message as one input.
- Tool approval consumes the next line only if it parses as a choice (`y/yes/approve/a` or `n/no/deny/d`, via `parseScriptedToolChoice`); otherwise the call is denied.
- If a denial has a following line, that line is forwarded as the user's instruction after denial.
- `/eval` prints that the menu is unavailable instead of opening it.
- Under `FREECODE_AUTO_CONFIRM=1` (eval subprocesses) every call is auto-approved until `FREECODE_MAX_TOOL_CALLS` is exceeded, after which calls are silently denied — a hard budget for unattended runs, no prompt (scripted stdin is closed).
- On EOF, prints `Goodbye!` unless `FREECODE_AUTO_CONFIRM=1`.

## Key Neighbors

- [session-modes.md](session-modes.md) — the interactive counterpart; both build a `CliSessionMode` for `session-runner.ts`.
- [tools/tool-approval.md](tools/tool-approval.md) — `formatScriptedToolMenu` / `parseScriptedToolChoice`.
- `../index.ts` — selects this mode for `--script` runs.
