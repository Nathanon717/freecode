> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` should stay identical.

# Freecode Agent Guide

Freecode is a TypeScript CLI coding agent. 

This file is intentionally short. Keep detailed reference material in `docs/` and link to it from here.

## Required Rules

- Map first, source second — see **Codebase Map** below.
- Never justify dead code by calling it a "fallback" - remove it.

## Codebase Map

`docs/map/` holds one page per `src/**/*.ts` file, mirroring the tree at identical depth. It
is the navigation layer: it exists so you can decide which files matter *without reading them*.

**Query the map; don't open it.** `npm run map` reads pages by section, so one call answers a
question across a whole directory. Reading a page whole — and reading source before the map —
is the exception that needs a reason.

| Command | Answers |
| --- | --- |
| `npm run map -- role <glob>` | what every file under a path is for, one line each — start here |
| `npm run map -- section "read when" <glob>` | when to open each of them; any section by name |
| `npm run map -- exports <file>` | signatures and their JSDoc, without the rest of the page |
| `npm run map -- sections <file>` | what one page holds, including its authored tail |
| `npm run map -- neighbors-of <file>` | who imports it, and whose link text has gone stale |

`<file>` takes `src/agent/loop.ts`, `agent/loop.md` or `agent/loop`; `<glob>` takes the first
two plus patterns (`agent/`, `**`), so a path pasted from `git diff --name-only` works either
way — but a bare stem is a directory to a glob, not a page. `--format json` for structured output.

`npm run map` needs shell access. A read-only `-p` turn has none — it reads
`docs/map/<path>.md` directly, which is why pages stay terse.

**Intent is edited in the source file, never on the page.** A page is a generated head — Role,
Read When, Exports, Neighbors, Tests, Budget, Env — plus one authored tail below it:

- What a module is for and when to open it belong to `@role` / `@readwhen` in its module header.
- Per-export intent belongs to that export's JSDoc.
- Only the tail is edited on the page itself.

So after changing a file in `/src/`, inspect `git diff --name-only`, update the `@role` /
`@readwhen` of anything whose purpose or read guidance moved — **and the page's tail if the
behavior it describes moved**, since no generator can fix that — then run `npm run docs:generate`.
`npm test` fails if a page drifts out of shape. No check can tell whether a tag still
*describes* its code — that is what `npm run intent-drift` (source tags) and `npm run map-drift`
(authored tails) are for.

Full page contract: `docs/map/README.md`. Ownership rules: `docs/doc-maintenance.md`.

## Enviornment

- If you are on Windows, use `npm.cmd run ...` in bash, not powershell.
- If you are on Linux, use `npm run ...`.

## Verification

- For any change touching `src/`, run `npm test` before reporting completion. Test, docs, and line-limit failures are blockers.
- `npm test` runs, in order: build, lint, `docs:generate` (which also runs the line-limit check), all e2e tests including TTY, then all unit tests except PTY. It stops at the first failing section and names the sections it therefore skipped.
- If a user-visible behavior changes, ensure it has e2e coverage in `tests/e2e/` or docs coverage, as appropriate.
- If generated reference sources change, update the source of truth first, then run `npm run docs:generate`. It checks generated docs first; if they are already current, it stops without rewriting them, and if they are stale, it regenerates them. Do not hand-edit generated sections.

Command details live in `docs/commands.md`. E2e details live in `docs/e2e-inventory.md` and `docs/e2e-testing.md`.

<!-- caller-only:start -->
## Subagents

This section is for agents that *call* Freecode. Freecode strips it when injecting this
file into its own system prompt (`src/agent/system-prompt.ts`), so a sub-agent never
sees it — do not remove the fence markers.

`freecode -p "<prompt>"` runs one read-only turn and prints the final answer to stdout, so
`$(freecode -p "...")` captures it. It cannot write, run commands, or spawn sub-agents, and
it is hard-blocked to free models — safe to call yourself. Adding `--edit` gives that turn
`create`/`edit`/`shell_exec` (still no sub-agents, still unconfirmed), so use it only for a
scoped change you will review. See the `-p` section of `docs/commands.md`.

**Reviewing an `--edit` run is not optional, and `git diff` is the wrong tool for it** — it
cannot tell the sub-agent's work from the work it was started on top of. `freecode checkpoint
diff` can: freecode snapshots the project immediately before the run's first write, so that
diff is the run's own changes and nothing else. Read it, then `freecode checkpoint accept` or
`freecode checkpoint revert`. Until you do one of those, the next `--edit` call is refused —
one edit agent per project at a time, so "the newest snapshot" always means "what the last
delegation did".

**Delegate by default.** Freecode's models are free, so the only budget that matters is the
*calling* agent's own context; reading files yourself is the exception that needs a reason.
The one standing exception is a question you can already write the Grep for, and that is the
whole test — *can I type the pattern right now?* A question phrased in terms of a literal (an
env var, an export, a filename) is a Grep. A question phrased in terms of behavior ("where
does X get decided", "which files handle Y") has no pattern to type, and is a delegated call.

**Demand output you can check cheaply.** Verification is the tax on delegation and decides
whether a call was worth making. Ask for `file_path:line_number`, exported names, or "answer
with the path": a claim anchored to a path is confirmed with one Glob, while an unanchored
assertion ("the retry logic is layered") must be trusted or re-derived, which defeats the point.

**If a task feels too wasteful to bother with, that instinct is miscalibrated** — it is
calibrated for paid providers, where cost scales with N. Here N is free, so exhaustive
sweeps, asking three models for a consensus, and low-yield speculative scans are all
rational. The same question asked of every file in a tree is a sweep: `docs/sweeps.md`.

**If a subagent can't do what you need, that is a bug in freecode — a program you are
editing anyway.** Fix the prompt first, then write the recipe, then change `src/`. Log the
gap in `docs/subagents/ideas.md`. Never conclude "the subagent can't do this" and quietly
do the work by hand.

**Declare your delegation decision** before any substantial task and at the end of every
nontrivial turn. A "no" must name the specific cheaper thing you did instead — the literal
Grep pattern, the one file. **"I didn't need a summary" and "it was only a few files" are
not reasons**; `docs/subagents/README.md` retires both by name. That file — verified
prompts, recorded failures, and how to feed and prune them — is for when you are improving
delegation, not reading before every task.
<!-- caller-only:end -->

## Debugging and Verifying the UI

To drive the real TUI, see `docs/pty-session.md`. This lets you verify and debug the real
app just like the user can. Also free-model-only. This is for inspecting the app, not for
delegating work.

## Documentation

- Use `docs/README.md` as the documentation index.
- Use `docs/doc-maintenance.md` for generated-doc ownership and maintenance rules.
- Use `docs/providers.md` for provider setup, registry facts, and provider testing.
- Use `docs/sweeps.md` to run or write a sweep — one LLM call per file across a tree (`npm run dead-code`, `npm run map-drift`, `npm run intent-drift`).
- After fixing a bug, create and index a new, short file in `docs/bug log/` (adding brand new behaviour doesn't count as a bug fix).
- **One file per bug per day.** If a bug you already logged today comes back — the fix was wrong, incomplete, or moved the failure — edit *that* file so it reads as current truth, rather than adding a second entry that supersedes it. A *different* bug on the same day still gets the next suffix (`24-07-2026b.md`, `24-07-2026c.md` — three unrelated bugs shipped on one day); a recurrence on a *later* day still gets its own dated file.
- Verification should succeed BEFORE docs are updated, not after.

## Git

- Only commit when asked.
- Never branch just to commit. If working on main, commit to main.
- Keep commit messages very short and terse. Use "feat:", "fix:", "refactor:" etc. where applicable.
- NEVER EVER include a "co-authored by..." sign off line in the commit msg.

## Handoffs

Whenever you reach a point in the session where there is still work that needs to be done, but your context is mostly full of data that will not be relavent to the remaining work, then stop and output a handoff message that will be used as the first user message in a fresh context. Put it in your response, don't make a file unless asked. 
