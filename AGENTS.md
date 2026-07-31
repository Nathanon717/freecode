> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` should stay identical.

# Freecode Agent Guide

Freecode is a TypeScript CLI coding agent with provider routing, an interactive REPL, and evaluation scenarios.

This file is intentionally short. Keep detailed reference material in `docs/` and link to it from here.

## Typical workflow when editing code

1. Read docs
2. Read code
3. Edit code
4. Get `npm test` green
5. Update docs


## Required Rules

- Before broad source reads, start with `docs/map/README.md` and the relevant map page.
- After changing any file in `/src/`, make sure to check its corresponding map page and consider if you need to update it.
- Never justify dead code by calling it a "fallback" - remove it.

## Enviornment

- If you are on Windows, use `npm.cmd run ...` in bash, not powershell.
- If you are on Linux, use `npm run ...`.

## Verification

- For any change touching `src/`, run `npm.cmd test` before reporting completion. Test, docs, and line-limit failures are blockers.
- `npm test` runs, in order: build, lint, `docs:generate` (which also runs the line-limit check), all e2e tests including TTY, then all unit tests except PTY. It stops at the first failing section and names the sections it therefore skipped.
- If a user-visible behavior changes, ensure it has e2e coverage in `tests/e2e/` or docs coverage, as appropriate.
- If generated reference sources change, update the source of truth first, then run `npm.cmd run docs:generate`. It checks generated docs first; if they are already current, it stops without rewriting them, and if they are stale, it regenerates them. Do not hand-edit generated sections.

Command details live in `docs/commands.md`. E2e details live in `docs/e2e.md` and `docs/testing-e2e.md`.

## Running Freecode Yourself

Two ways, for two different jobs:

- **Ask it a question:** `freecode -p "<prompt>"` runs one read-only turn and prints the final answer to stdout, so `$(freecode -p "...")` captures it. It cannot write, run commands, or spawn sub-agents, and it is hard-blocked to free models — safe to call yourself. See the `-p` section of `docs/commands.md`.
- **Drive the real TUI:** `docs/pty-session.md` (lets you verify and debug the real app just like the user can). Also free-model-only.

**Delegate to it.** Freecode's models are free, so the only budget that matters is the
*calling* agent's own context. Before any broad read, consider spending a `freecode -p`
call instead. See `docs/subagents/README.md` for when it pays off, verified prompts, and
known failure modes. Maintain it: add when you learn something, and delete entries whose
premise is gone rather than annotating them as outdated.

## Documentation

- Use `docs/README.md` as the documentation index.
- Use `docs/docs.md` for generated-doc ownership and maintenance rules.
- Use `docs/map/README.md` for source navigation.
- Use `docs/providers.md` for provider setup, registry facts, and provider testing.
- After fixing a bug, create and index a new, short file in `docs/bug log/` (adding brand new behaviour doesn't count as a bug fix).
- Verification should succeed BEFORE docs are updated, not after.

After code changes, inspect `git diff --name-only` and update only map pages for changed files whose purpose, ownership, exports, dependencies, or read/use guidance changed.

## Git

- Only commit when asked.
- Never branch just to commit. If working on main, commit to main.
- Keep commit messages very short and terse. Use "feat:", "fix:", "refactor:" etc. where applicable.
- NEVER EVER include a "co-authored by..." sign off line in the commit msg.

## Handoffs

Whenever you reach a point in the session where there is still work that needs to be done, but your context is mostly full of data that will not be relavent to the remaining work, then stop and output a handoff message that will be used as the first user message in a fresh context. Put it in your response, don't make a file unless asked. 