> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` should stay identical. If you are reading this file, do not read the other one.

# Freecode Agent Guide

This file is intentionally short. Keep detailed reference material in `docs/` and link to it from here.

## Required Rules

- Windows only. Run commands in PowerShell or cmd, not WSL.
- Run npm scripts as `npm.cmd run ...` or `cmd /c npm.cmd run ...`; do not rely on the PowerShell `npm` shim.
- Run `npm.cmd run build` after every code change.
- Before broad source reads, start with `docs/map/README.md` and the relevant map page.
- Do not run LLM evals without asking first. LLM evals are `/eval` or `npm.cmd run eval`.

## Verification

- For any change touching `src/`, run `npm.cmd run verify:fast` before reporting completion. Build, docs, and scenario failures are blockers.
- `verify:fast` skips TTY screen scenarios (they are slow and require a PTY). Run `npm.cmd run verify:e2e` to run TTY scenarios only.
- For quick visual checks of the interactive TUI (e.g. after adding a provider, open the model picker to confirm it appears), use `npm.cmd run inspect:tty -- '<json>'`. Pass a JSON object with a `steps` array — each step has `send` (keystrokes) and optionally `screenContains`/`screenAbsent`. Always send typed text and control keys (Enter `\r`, Tab `\t`) as **separate steps**. See `docs/testing-scenarios.md` for full shape and examples.
- If a user-visible behavior changes, ensure it has scenario coverage in `tests/scenarios/` or docs coverage, as appropriate.
- If generated reference sources change, update the source of truth first, then run `npm.cmd run docs:generate`. Do not hand-edit generated sections.
- Run `npm.cmd run docs:check` before reporting docs-related or user-visible changes complete.

Command details live in `docs/commands.md`. Scenario details live in `docs/scenarios.md` and `docs/testing-scenarios.md`.

## Interactive Freecode Sessions

To drive the live freecode TUI as an agent (open menus, send keystrokes, read the rendered screen), use `npm run pty:session`. A persistent PTY daemon holds a real terminal session open; you interact with it step by step.

```bash
# Start a session — prints SESSION_ID and the initial screen
npm run pty:session -- start

# Send keystrokes, get the resulting screen
npm run pty:session -- send <SESSION_ID> <keys>

# Wait for agent output to finish before snapshotting
npm run pty:session -- send <SESSION_ID> $'some prompt\r' --wait-for "for commands"

# Read the screen without sending input
npm run pty:session -- screen <SESSION_ID>

# Kill the session when done
npm run pty:session -- stop <SESSION_ID>
```

Control chars: Enter `$'\r'`, Tab `$'\t'`, Escape `$'\x1b'`, Ctrl-C `$'\x03'`, arrows `$'\x1b[A'`/`$'\x1b[B'`. Multiple key args are concatenated.

Full reference — patterns, flags, lifecycle: `docs/pty-session.md`

## Documentation

- Use `docs/README.md` as the documentation index.
- Use `docs/docs.md` for generated-doc ownership and maintenance rules.
- Use `docs/map/README.md` for source navigation.
- Use `docs/providers.md` for provider setup, registry facts, and provider testing.
- Use `docs/architecture/adr/` for durable architectural decisions, not routine fixes.

After code changes, inspect `git diff --name-only` and update only map pages for changed files whose purpose, ownership, exports, dependencies, or read/use guidance changed.

## Session Logs

After completing a new feature or significant change, ask:

> "Want me to write a session log for this?"

Only create a log if the user confirms. Session log instructions and examples live in `docs/sessions/README.md`.

## Project Notes

Freecode is a TypeScript CLI coding agent with provider routing, an interactive REPL, scenario verification, session persistence, and a Claude Code MCP bridge.

- CLI and slash command behavior: `docs/commands.md`
- Source layout and ownership: `docs/map/README.md`
- MCP bridge entry point: `docs/map/mcp-server.md`
- Provider routing: `docs/map/providers/router.md`
