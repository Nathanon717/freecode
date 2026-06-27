> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` should stay identical.

# Freecode Agent Guide

Freecode is a TypeScript CLI coding agent with provider routing, an interactive REPL, and scenario verification.

This file is intentionally short. Keep detailed reference material in `docs/` and link to it from here.

## Required Rules

- Before broad source reads, start with `docs/map/README.md` and the relevant map page.
- After changing any file in `/src/`, make sure to check its corresponding map page and consider if you need to update it.
- Never prefix Bash commands with `cd <dir> &&` when already in that directory — it triggers a permission prompt on the `cd` even if the actual command is allowed.

## Enviornment

- If you are on Windows, use `npm.cmd run ...` in bash, not powershell.
- If you are on Linux, use `npm run ...`.

## Verification

- For any change touching `src/`, run `npm.cmd test` before reporting completion. Build, docs, and scenario failures are blockers. Never end your turn 
- `npm test` runs build + `docs:generate` + all non-LLM scenarios including TTY + all unit tests except PTY.
- For quick visual checks of the interactive TUI (e.g. after adding a provider, open the model picker to confirm it appears), use `pty`. Start a session, send keystrokes step by step, read the rendered screen. See `docs/pty-session.md` for full reference and examples.
- If a user-visible behavior changes, ensure it has scenario coverage in `tests/scenarios/` or docs coverage, as appropriate.
- If generated reference sources change, update the source of truth first, then run `npm.cmd run docs:generate`. It checks generated docs first; if they are already current, it stops without rewriting them, and if they are stale, it regenerates them. Do not hand-edit generated sections.

Command details live in `docs/commands.md`. Scenario details live in `docs/scenarios.md` and `docs/testing-scenarios.md`.

## Interactive Freecode Sessions

See `docs/pty-session.md` on how to drive a live, real freecode TUI (lets you verify and debug the real app just like the user can).
 
## Documentation

- Use `docs/README.md` as the documentation index.
- Use `docs/docs.md` for generated-doc ownership and maintenance rules.
- Use `docs/map/README.md` for source navigation.
- Use `docs/providers.md` for provider setup, registry facts, and provider testing.
- After fixing a bug, make a new, short file in `docs/bug log/`.

After code changes, inspect `git diff --name-only` and update only map pages for changed files whose purpose, ownership, exports, dependencies, or read/use guidance changed.