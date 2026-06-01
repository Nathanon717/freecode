# PTY Session — Driving Freecode Interactively

`pty` lets an agent (or a developer) drive the live freecode TUI from the shell, exactly as a human would. A persistent daemon holds a real pseudo-terminal open; each command sends keystrokes or reads the rendered screen without restarting the process.

Source: `tests/harness/pty/session.ts` — wrapper: `pty.cmd` (Windows) / `pty` (bash)

## Reviewing screens for correctness

When you capture a screen after a command, don't just check that the expected content is present — check the **layout** too. Common rendering bugs look like:

- **Status line text bleeding into scroll content**: `211 ctx tokens` or other right-aligned status text appears on the same row as output text instead of being pinned to the last row.
- **Stale bottom UI rows**: the prompt hint (`> / for commands`) or status bar content remains visible inside an interactive UI (config editor, model picker, etc.) because the rows weren't cleared on teardown.
- **Garbage suffix on a line**: a line like `Eval scenariosds` where the trailing characters (`ds`) are leftover from a previous render that wasn't fully overwritten.

For each screen you review, explicitly check:
1. Is any status bar / token count text appearing mid-output instead of only on the bottom status row?
2. Are any prompt hints (`> / for commands`) visible inside an interactive UI that should own the full screen?
3. Do any output lines have unexpected trailing characters that don't belong?

These are easy to miss when scanning for functional correctness — look for them deliberately.

## When to use this

Use `pty` whenever you want to:

- Check what freecode actually looks like after a UI change (model picker, config editor, autocomplete, status line, etc.)
- Navigate menus interactively (arrow keys, Enter, Tab)
- Confirm a slash command works end-to-end in the live TUI
- Do anything in freecode that a human would do at the terminal

For one-shot batch assertions in automated tests, prefer a TTY scenario file instead (see `docs/testing-scenarios.md`).

## Workflow

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

## Commands

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

**Available screens:** `home`, `models`, `config`, `eval`

### `send <keys> [<keys>...] [--wait-for <text>] [--quiet-ms N]`

Writes keystrokes to the running session and prints the screen after output settles.

- Multiple key arguments are **concatenated in order**: `pty send h e l l o` sends `"hello"`.
- **Named key aliases** — use these instead of raw escape sequences:

  | Alias                | Key        |
  |----------------------|------------|
  | `enter` or `ent`     | Enter (CR) |
  | `esc` or `escape`    | Escape     |
  | `up`                 | Up arrow   |
  | `down`               | Down arrow |
  | `left`               | Left arrow |
  | `right`              | Right arrow|
  | `space`              | Space      |
  | `tab`                | Tab        |

  ```bash
  pty send down down enter   # arrow down twice, then select
  pty send esc               # dismiss a menu
  ```

- **Slash commands auto-submit** — a `/command` argument automatically appends Enter, so you don't need a separate step:
  ```bash
  pty send /model    # types /model and submits — no extra enter needed
  pty send /config   # same
  ```

- Pass **`-`** as the keys argument to read keystrokes from stdin (slash commands from stdin also auto-submit). Use this on Windows to avoid MSYS path mangling:
  ```bash
  printf '/model' | pty send -   # types /model and submits
  ```
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

This applies whenever input starts with `/`. For all control characters (Enter, arrows, etc.) use the `printf` stdin form — see the Control Characters section below.

**A brief cmd window may flash** when the PTY daemon starts or stops. This is a ConPTY limitation on Windows and doesn't affect functionality.

**`$'\r'` and other `$'...'` control chars as positional args are unreliable on Windows.** The CR byte in the argument can mangle the Windows command line parser. Use `printf` + stdin instead:

```bash
printf '\r'     | pty send -
printf '\x1b[B' | pty send -
```

## Control characters

On any platform, use the named key aliases described in the `send` section above — they work as positional arguments directly:

```bash
pty send enter        # Enter
pty send esc          # Escape
pty send up           # Up arrow
pty send down down    # Down arrow twice
```

For keys without an alias (Ctrl-C, Backspace, etc.) use `printf` piped to stdin:

| Key        | stdin form           |
|------------|----------------------|
| Ctrl-C     | `printf '\x03'`      |
| Backspace  | `printf '\x7f'`      |

On Linux/Mac you can also pass raw escape sequences as positional args using Bash ANSI-C quoting (`$'\r'`, `$'\x1b[B'`, etc.).

## Common patterns

### Open the model picker and navigate it

```bash
pty start
pty goto models --screen
pty send down    # arrow down
pty send enter   # select
pty stop
```

Always send typed text and control keys (Enter, arrow keys, Tab) as **separate steps**. Combining them in one call (e.g. `pty send hello enter`) is fine; just don't expect a single `printf '/model\r'` to work — the app needs to settle between typing and submitting.

### Open a slash command directly

```bash
pty start --screen
pty send /model   # types /model and auto-submits; opens model picker
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

### Check a screen without disturbing input

```bash
pty screen
```

## Session lifecycle

- The daemon persists until `stop` is called or the process is killed.
- Each session gets an isolated `FREECODE_HOME` temp directory so it never conflicts with other sessions or the developer's real config.
- A flag file under the OS temp dir (`freecode-sessions/<hex>.ready`) stores the daemon's TCP port and is cleaned up on `stop` or process exit.
- Only one session runs at a time — `start` stops any existing session before spawning a new one.
