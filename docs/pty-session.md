# PTY Session — Driving Freecode Interactively

`npm run pty:session` lets an agent (or a developer) drive the live freecode TUI from the shell, exactly as a human would. A persistent daemon holds a real pseudo-terminal open; each command sends keystrokes or reads the rendered screen without restarting the process.

Source: `tests/harness/pty/session.ts`

## When to use this

Use `pty:session` whenever you want to:

- Check what freecode actually looks like after a UI change (model picker, config editor, autocomplete, status line, etc.)
- Navigate menus interactively (arrow keys, Enter, Tab)
- Confirm a slash command works end-to-end in the live TUI
- Do anything in freecode that a human would do at the terminal

For one-shot batch assertions in automated tests, prefer `npm run inspect:tty` or a TTY scenario file instead (see `docs/testing-scenarios.md`).

## Workflow

```bash
# 1. Start a session — prints SESSION_ID and the initial screen
npm run pty:session -- start

# 2. Send keystrokes — prints the resulting screen after each call
npm run pty:session -- send <SESSION_ID> <keys>

# 3. Stop when done
npm run pty:session -- stop <SESSION_ID>
```

Capture the session ID from the `SESSION_ID=...` line on the first line of `start` output.

## Commands

### `start [--cols N] [--rows N]`

Spawns a freecode daemon in a real PTY, waits for the prompt to be ready, and prints the initial screen. Defaults: `--cols 80 --rows 24`.

Output format:
```
SESSION_ID=abc123def456
────────────────────────────── (cols wide)
[rendered screen lines]
──────────────────────────────
```

### `send <id> <keys> [<keys>...] [--wait-for <text>] [--quiet-ms N]`

Writes keystrokes to the running session and prints the screen after output settles.

- Multiple key arguments are **concatenated in order**: `send <id> m o` sends `"mo"`.
- `--wait-for <text>`: wait for a specific string to appear in the raw output stream before snapshotting. Use this when a keystroke triggers LLM work — wait for `"for commands"` to know the prompt is back.
- `--quiet-ms N`: override the settle window (default 350 ms). Increase for slow renders.

### `screen <id>`

Snapshot the current screen without sending any input. Useful for confirming state after an async operation completes.

### `stop <id>`

Kills the daemon and cleans up the socket and flag files under `/tmp/freecode-sessions/`.

## Control characters

Use shell ANSI-C quoting (`$'...'`) to pass control characters as Bash arguments:

| Key       | Argument      |
|-----------|---------------|
| Enter     | `$'\r'`       |
| Tab       | `$'\t'`       |
| Escape    | `$'\x1b'`     |
| Ctrl-C    | `$'\x03'`     |
| Backspace | `$'\x7f'`     |
| Up arrow  | `$'\x1b[A'`   |
| Down arrow| `$'\x1b[B'`   |

## Common patterns

### Open the model picker and navigate it

```bash
ID=$(npm run pty:session -- start 2>&1 | grep SESSION_ID | cut -d= -f2)
npm run pty:session -- send "$ID" $'/model\r'    # run /model
npm run pty:session -- send "$ID" $'\x1b[B'      # arrow down
npm run pty:session -- send "$ID" $'\r'          # select
npm run pty:session -- stop "$ID"
```

### Type a slash command with autocomplete

```bash
npm run pty:session -- send "$ID" /              # open suggestion list
npm run pty:session -- send "$ID" he             # filter to /help
npm run pty:session -- send "$ID" $'\t'          # accept inline completion
npm run pty:session -- send "$ID" $'\r'          # submit
```

### Send a prompt to the agent and wait for it to finish

```bash
npm run pty:session -- send "$ID" $'list the files here\r' --wait-for "for commands"
```

The `--wait-for "for commands"` waits until the prompt is live again, which means the agent turn is complete.

### Check a screen without disturbing input

```bash
npm run pty:session -- screen "$ID"
```

## Session lifecycle

- The daemon persists until `stop` is called or the process is killed.
- Each session gets an isolated `FREECODE_HOME` temp directory so it never conflicts with other sessions or the developer's real config.
- Socket and flag files live in `/tmp/freecode-sessions/<id>.{sock,ready}` and are cleaned up on `stop` or process exit.
- Multiple sessions can run simultaneously.
