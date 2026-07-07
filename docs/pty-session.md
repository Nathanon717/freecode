# PTY Session — Driving Freecode Interactively

`pty` lets an agent (or a developer) drive the live freecode TUI from the shell, exactly as a human would. A persistent daemon holds a real pseudo-terminal open; each command sends keystrokes or reads the rendered screen without restarting the process.

Source: `tests/harness/pty/session.ts` — wrapper: `pty.cmd` (Windows) / `pty` (bash)

<!-- PTY QUICKSTART: hand-written. sync-docs measures the last non-empty line before END PTY QUICKSTART and writes "read lines 1–n" into docs/README.md. Keep everything needed to drive pty ABOVE the END marker — never push usage-essential content below it. -->
## Quick usage

Everything you need to drive `pty` is in this section. Sections below it are reference detail — per-flag behavior, platform caveats, and internals.

### Workflow

```bash
# 1. Start a session (add --screen to also print the initial screen)
pty start --screen

# 2. Navigate to a named screen
pty goto models --screen

# 3. Send keystrokes
pty send <keys>

# 4. Stop when done
pty stop
```

`start` and `goto` write the active session to `active.json` in the session dir, so subsequent `send`, `screen`, and `stop` pick it up automatically.

### Commands

| Command | What it does |
|---|---|
| `pty start [--screen]` | Spawn a freecode daemon in a real PTY; `--screen` prints the initial screen |
| `pty goto <screen> [--screen]` | BFS-navigate to a named screen; `--screen` also prints it |
| `pty send <keys> [--wait-for <text>]` | Write keystrokes, print the screen after output settles |
| `pty screen` | Snapshot the current screen without sending input |
| `pty stop` | Kill the daemon and clean up |

**Screens for `goto`:** `home`, `models`, `config`, `eval`

### Sending keys

Use named aliases as positional args — they work on every platform:

| Alias                 | Key         |
|-----------------------|-------------|
| `enter` or `ent`      | Enter (CR)  |
| `esc` or `escape`     | Escape      |
| `up`                  | Up arrow    |
| `down`                | Down arrow  |
| `left`                | Left arrow  |
| `right`               | Right arrow |
| `space`               | Space       |
| `tab`                 | Tab         |
| `backspace` or `back` | Backspace   |

```bash
pty send down down enter   # arrow down twice, then select
pty send /model            # slash commands auto-submit — no separate enter
```

Send typed text and control keys as **separate steps** — don't expect a single `printf '/model\r'` to work, because the app needs to settle between typing and submitting. (`pty send hello enter` in one call is fine.)

For keys with no alias, or for slash commands on Windows (where MSYS rewrites `/model` into a path), pipe the input via stdin with `-`:

| Input          | stdin form                     |
|----------------|--------------------------------|
| Ctrl-C         | `printf '\x03' \| pty send -`  |
| Backspace      | `printf '\x7f' \| pty send -`  |
| Slash command  | `printf '/model' \| pty send -`|
<!-- END PTY QUICKSTART -->

## When to use this

Use `pty` whenever you want to:

- Check what freecode actually looks like after a UI change (model picker, config editor, autocomplete, status line, etc.)
- Navigate menus interactively (arrow keys, Enter, Tab)
- Confirm a slash command works end-to-end in the live TUI
- Do anything in freecode that a human would do at the terminal

For one-shot batch assertions in automated tests, prefer a TTY scenario file instead (see `docs/testing-scenarios.md`).

## Command reference

Per-command detail beyond the [Quick usage](#quick-usage) summary.

### `start [--screen] [--cols N] [--rows N]`

Spawns a freecode daemon in a real PTY and waits for the prompt to be ready. Defaults: `--cols 80 --rows 24`. Does **not** print any output unless `--screen` is passed, in which case it prints the initial screen render.

> **Matching a specific terminal size:** only override if you need pixel-perfect layout verification — e.g. `--cols 120 --rows 28`. Otherwise leave the defaults.

Output format:
```
────────────────────────────── (cols wide)
[rendered screen lines]
──────────────────────────────
```

### `goto <screen> [--screen] [--cols N] [--rows N]`

Navigates from the current screen to `<screen>` by BFS-pathfinding through the nav graph. Prints `navigated: <from> → <to>`. With `--screen`, also prints the resulting screen render. Auto-starts a session if none is running.

### `send <keys> [<keys>...] [--wait-for <text>] [--quiet-ms N]`

Writes keystrokes to the running session and prints the screen after output settles. Multiple key arguments are **concatenated in order**: `pty send h e l l o` sends `"hello"`. For the named key aliases, slash auto-submit, and the `-`/stdin form, see [Quick usage](#quick-usage).

- On Linux/Mac you can also pass raw escape sequences as positional args using Bash ANSI-C quoting (`$'\r'`, `$'\x1b[B'`); on Windows these are unreliable, so use the stdin form (see [Windows notes](#windows-local-notes)).
- `--wait-for <text>`: wait for a specific string to appear in the raw output stream before snapshotting. Use this when a keystroke triggers LLM work — wait for `"for commands"` to know the prompt is back.
- `--quiet-ms N`: override the settle window (default 350 ms). Increase for slow renders.

### `screen`

Snapshot the current screen without sending any input. Useful for confirming state after an async operation completes.

### `stop`

Kills the daemon and cleans up the socket and flag files under `/tmp/freecode-sessions/`. Clears `active.json`.

## Windows (local) notes

The PTY session works on both Windows and Linux. Run `npm.cmd link` once from the project root to put `pty` on PATH in Git Bash and PowerShell. Linux containers handle this automatically via `devcontainer.json`.

Two things additionally differ when running in Git Bash on Windows:

**Slash commands get mangled by MSYS path conversion.** Git Bash rewrites arguments that look like Unix paths — `/model` becomes `C:/Program Files/Git/model`. Pass `-` as the keys arg and pipe the input via stdin to bypass this entirely:

```bash
printf '/model' | pty send -   # type command
printf '\r'     | pty send -   # submit (separate step)
```

This applies whenever input starts with `/`.

**A brief cmd window may flash** when the PTY daemon starts or stops. This is a ConPTY limitation on Windows and doesn't affect functionality.

**The first keystroke right after `start` can be silently dropped.** ConPTY's raw-mode key handler isn't guaranteed live the instant the prompt paints. `runServer` in `session.ts` probes with a harmless space keystroke (clearing it afterward) before marking the daemon ready, so callers of `start`/`goto` don't need to work around this themselves.

**`$'\r'` and other `$'...'` control chars as positional args are unreliable on Windows.** The CR byte in the argument can mangle the Windows command line parser. Use `printf` + stdin instead:

```bash
printf '\r'     | pty send -
printf '\x1b[B' | pty send -
```

## Common patterns

### Open the model picker and navigate it

```bash
pty start
pty goto models --screen
pty send down    # arrow down
pty send enter   # select
pty stop
```

### Type a slash command with autocomplete

```bash
printf '/' | pty send -   # open suggestion list (on Windows; or: pty send /)
pty send he               # filter to /help
pty send tab              # accept inline completion
pty send enter            # submit
```

### Send a prompt to the agent and wait for it to finish

```bash
pty send "list the files here"
pty send enter --wait-for "for commands"
```

The `--wait-for "for commands"` waits until the prompt is live again, which means the agent turn is complete.

## Session lifecycle

- The daemon persists until `stop` is called or the process is killed.
- Each session gets an isolated `FREECODE_HOME` temp directory so it never conflicts with other sessions or the developer's real config.
- A flag file under the OS temp dir (`freecode-sessions/<hex>.ready`) stores the daemon's TCP port and is cleaned up on `stop` or process exit.
- Only one session runs at a time — `start` stops any existing session before spawning a new one.
