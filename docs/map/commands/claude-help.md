# src/commands/claude-help.ts - Claude Help Command

**Role:** Implements the `/claude` slash command. Captures the recent terminal output via `screen-buffer`, calls `claude -p` with a diagnosis prompt, renders the response, and optionally passes the diagnosis to the freecode agent for an automated fix with a restart prompt afterward.

## Exports

| Symbol | Description |
|--------|-------------|
| `runClaudeHelpCommand` | Main entry point. Takes `rl`, `userMessage` (text after `/claude`), and a `triggerFix` callback. Handles the full flow: call Claude CLI → show diagnosis → action picker → optional agent fix → restart picker. |

## Flow

1. Reads `getScreenBuffer()` for recent terminal output.
2. Spawns `claude -p <prompt>` asynchronously; prints "Asking Claude for a diagnosis..." while waiting.
3. Displays the diagnosis in a styled block.
4. Shows a raw picker: **Fix with Claude Code** / **Dismiss**.
5. If fix chosen: tears down freecode UI, spawns `claude <fixPrompt>` via `spawnSync` (blocking, `stdio: inherit`), then exits freecode with a "run `freecode` to start fresh" message.

## Key neighbors

- `src/util/screen-buffer.ts` — provides screen content.
- `src/cli/raw-picker.ts` — used for the action picker.
- `src/cli/input-modes.ts` — delegates to this via `runClaudeHelp`.
- `src/cli/command-dispatcher.ts` — calls `runtime.runClaudeHelp`.

## Update triggers

Update this page if the picker options change, the Claude CLI invocation changes, or the fix/restart flow is altered.
