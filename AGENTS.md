> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` should stay identical. If you are reading this file, do not read the other one.

# Freecode Agent Guide

This file is intentionally short. Keep detailed reference material in `docs/` and link to it from here.

## Required Rules

- Windows only. Run commands in PowerShell or cmd, not WSL. **Exception:** when running in a Claude Code web container (Linux), use `npm run ...` instead of `npm.cmd run ...`. See `docs/claude_code_web.md`.
- Run npm scripts as `npm.cmd run ...` or `cmd /c npm.cmd run ...`; do not rely on the PowerShell `npm` shim.
- Run `npm.cmd run build` after every code change.
- Before broad source reads, start with `docs/map/README.md` and the relevant map page.
- Do not run LLM evals without asking first. LLM evals run via the `/eval` slash command inside freecode.
- Never prefix Bash commands with `cd <dir> &&` when already in that directory — it triggers a permission prompt on the `cd` even if the actual command is allowed.

## Verification

- For any change touching `src/`, run `npm.cmd test` before reporting completion. Build, docs, and scenario failures are blockers.
- `npm test` runs build + `docs:generate` + all non-LLM scenarios including TTY + all unit tests except PTY (~14s).
- For quick visual checks of the interactive TUI (e.g. after adding a provider, open the model picker to confirm it appears), use `pty`. Start a session, send keystrokes step by step, read the rendered screen. See `docs/pty-session.md` for full reference and examples.
- If a user-visible behavior changes, ensure it has scenario coverage in `tests/scenarios/` or docs coverage, as appropriate.
- If generated reference sources change, update the source of truth first, then run `npm.cmd run docs:generate`. It checks generated docs first; if they are already current, it stops without rewriting them, and if they are stale, it regenerates them. Do not hand-edit generated sections.
- Run `npm.cmd run docs:generate` before reporting docs-related or user-visible changes complete.

Command details live in `docs/commands.md`. Scenario details live in `docs/scenarios.md` and `docs/testing-scenarios.md`.

## Interactive Freecode Sessions

To drive the live freecode TUI as an agent, use `pty`. See `docs/pty-session.md` for commands, patterns, control characters, and lifecycle details.

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

Only create a log if the user confirms. Write logs to `docs/sessions/YYYY-MM-DD-slug.md`. Full instructions in `docs/sessions/README.md`.

## Project Notes

Freecode is a TypeScript CLI coding agent with provider routing, an interactive REPL, scenario verification, and session persistence.

- CLI and slash command behavior: `docs/commands.md`
- Source layout and ownership: `docs/map/README.md`
- Provider routing: `docs/map/providers/router.md`
