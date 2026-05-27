# PTY Usage Guide

Read this right before driving freecode interactively with `pty`.

For how the daemon works internally, source location, and Windows edge-case details: see [`docs/pty-session.md`](pty-session.md).

## Workflow

```bash
# 1. Start a session (add --screen to also print the initial screen)
pty start --screen

# 2. Navigate to a named screen
pty goto models --screen

# 3. Send keystrokes and read the screen
pty send <keys>

# 4. Stop when done
pty stop
```

`start` and `goto` write the active session to a state file — subsequent `send`, `screen`, and `stop` pick it up automatically.

**Available screens for `goto`:** `home`, `models`, `config`, `eval`

## Commands

| Command | What it does |
|---|---|
| `pty start [--screen]` | Spawn a freecode daemon in a real PTY; add `--screen` to print initial screen |
| `pty goto <screen> [--screen]` | BFS-navigate to a named screen; `--screen` also prints it |
| `pty send <keys> [--wait-for <text>]` | Write keystrokes, print screen after output settles |
| `pty screen` | Snapshot current screen without sending input |
| `pty stop` | Kill the daemon and clean up |

`--wait-for <text>`: blocks until `<text>` appears in raw output before snapshotting. Use `--wait-for "for commands"` when waiting for an agent turn to finish.

## Critical: send text and control keys as separate steps

Never combine text and a control character in one `printf` — the control key may be silently dropped:

```bash
# WRONG — Enter may not register
printf '/model\r' | pty send -

# CORRECT — two separate steps
printf '/model' | pty send -
printf '\r'     | pty send -
```

## Control characters

Always use `printf` piped to stdin for control characters:

| Key        | stdin form           |
|------------|----------------------|
| Enter      | `printf '\r'`        |
| Tab        | `printf '\t'`        |
| Escape     | `printf '\x1b'`      |
| Ctrl-C     | `printf '\x03'`      |
| Backspace  | `printf '\x7f'`      |
| Up arrow   | `printf '\x1b[A'`    |
| Down arrow | `printf '\x1b[B'`    |

On Linux you can also pass these as positional args using `$'\r'`, `$'\x1b[B'`, etc.

For any input starting with `/` (slash commands), always use stdin — Git Bash on Windows rewrites `/model` to a Windows path.

## Common patterns

### Open the model picker and navigate it

```bash
pty start
pty goto models --screen
printf '\x1b[B' | pty send -   # arrow down
printf '\r'     | pty send -   # select
pty stop
```

### Type a slash command

```bash
printf '/' | pty send -   # open suggestion list
pty send he               # filter to /help
printf '\t' | pty send -  # accept inline completion
printf '\r' | pty send -  # submit
```

### Send a prompt and wait for the agent to finish

```bash
pty send "list the files here"
printf '\r' | pty send - --wait-for "for commands"
```

### Read the screen without sending input

```bash
pty screen
```

## Reviewing screens for correctness

When you capture a screen, check layout as well as content. Common rendering bugs:

1. **Status bar text mid-output** — `211 ctx tokens` or other right-aligned text appearing on a content row instead of the bottom status row.
2. **Stale UI rows inside an interactive screen** — prompt hint (`> / for commands`) or status bar still visible inside the model picker or config editor.
3. **Garbage trailing characters** — e.g. `Eval scenariosds` where `ds` is a leftover from a previous render.

Check for all three deliberately on every screen you review.
