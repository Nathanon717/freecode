# PTY Session — Driving Freecode Interactively

`npm run pty:session` lets an agent (or a developer) drive the live freecode TUI from the shell, exactly as a human would. A persistent daemon holds a real pseudo-terminal open; each command sends keystrokes or reads the rendered screen without restarting the process.

Source: `tests/harness/pty/session.ts`

## When to use this

Use `pty:session` whenever you want to:

- Check what freecode actually looks like after a UI change (model picker, config editor, autocomplete, status line, etc.)
- Navigate menus interactively (arrow keys, Enter, Tab)
- Confirm a slash command works end-to-end in the live TUI
- Do anything in freecode that a human would do at the terminal

For one-shot batch assertions in automated tests, prefer a TTY scenario file instead (see `docs/testing-scenarios.md`).

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
- Pass **`-`** as the keys argument to read keystrokes from stdin. Use this for any input that starts with `/` (slash commands), which Git Bash on Windows would otherwise mangle into a Windows path:
  ```bash
  printf '/model' | npm run pty:session -- send "$ID" -   # type command
  printf '\r'     | npm run pty:session -- send "$ID" -   # submit (separate step)
  ```
- `--wait-for <text>`: wait for a specific string to appear in the raw output stream before snapshotting. Use this when a keystroke triggers LLM work — wait for `"for commands"` to know the prompt is back.
- `--quiet-ms N`: override the settle window (default 350 ms). Increase for slow renders.

### `screen <id>`

Snapshot the current screen without sending any input. Useful for confirming state after an async operation completes.

### `stop <id>`

Kills the daemon and cleans up the socket and flag files under `/tmp/freecode-sessions/`.

## Windows (local) notes

The PTY session works on both Windows and Linux. Two things differ when running in Git Bash on Windows:

**Slash commands get mangled by MSYS path conversion.** Git Bash rewrites arguments that look like Unix paths — `/model` becomes `C:/Program Files/Git/model`. Pass `-` as the keys arg and pipe the input via stdin to bypass this entirely:

```bash
printf '/model' | npm run pty:session -- send "$ID" -   # type command
printf '\r'     | npm run pty:session -- send "$ID" -   # submit (separate step)
```

This applies whenever input starts with `/`. For all control characters (Enter, arrows, etc.) use the `printf` stdin form — see the Control Characters section below.

**A brief cmd window may flash** when the PTY daemon starts or stops. This is a ConPTY limitation on Windows and doesn't affect functionality.

**`$'\r'` and other `$'...'` control chars as positional args are unreliable on Windows.** The CR byte in the argument can mangle the Windows command line parser. Use `printf` + stdin instead:

```bash
printf '\r' | npm run pty:session -- send "$ID" -
printf '\x1b[B' | npm run pty:session -- send "$ID" -
```

## Control characters

Use `printf` piped to stdin to send control characters reliably on Windows:

| Key       | stdin form                      |
|-----------|---------------------------------|
| Enter     | `printf '\r'`                   |
| Tab       | `printf '\t'`                   |
| Escape    | `printf '\x1b'`                 |
| Ctrl-C    | `printf '\x03'`                 |
| Backspace | `printf '\x7f'`                 |
| Up arrow  | `printf '\x1b[A'`               |
| Down arrow| `printf '\x1b[B'`               |

On Linux/Mac only, you can pass these as positional args using Bash ANSI-C quoting (`$'\r'`, `$'\x1b[B'`, etc.).

## Common patterns

### Open the model picker and navigate it

```bash
ID=$(npm run pty:session -- start 2>&1 | grep SESSION_ID | cut -d= -f2)
printf '/model' | npm run pty:session -- send "$ID" -     # type /model
printf '\r'     | npm run pty:session -- send "$ID" -     # submit
printf '\x1b[B' | npm run pty:session -- send "$ID" -     # arrow down
printf '\r'     | npm run pty:session -- send "$ID" -     # select
npm run pty:session -- stop "$ID"
```

Always send typed text and control keys (Enter, arrow keys, Tab) as **separate steps**. Combining them in one `printf` (e.g. `printf '/model\r'`) may type the text but skip the key action.

### Type a slash command with autocomplete

```bash
printf '/' | npm run pty:session -- send "$ID" -   # open suggestion list
npm run pty:session -- send "$ID" he                # filter to /help
printf '\t' | npm run pty:session -- send "$ID" -   # accept inline completion
printf '\r' | npm run pty:session -- send "$ID" -   # submit
```

### Send a prompt to the agent and wait for it to finish

```bash
npm run pty:session -- send "$ID" "list the files here" --wait-for "for commands"
printf '\r' | npm run pty:session -- send "$ID" -
```

The `--wait-for "for commands"` waits until the prompt is live again, which means the agent turn is complete.

### Check a screen without disturbing input

```bash
npm run pty:session -- screen "$ID"
```

## Session lifecycle

- The daemon persists until `stop` is called or the process is killed.
- Each session gets an isolated `FREECODE_HOME` temp directory so it never conflicts with other sessions or the developer's real config.
- A flag file under the OS temp dir (`freecode-sessions/<id>.ready`) stores the daemon's TCP port and is cleaned up on `stop` or process exit.
- Multiple sessions can run simultaneously.
