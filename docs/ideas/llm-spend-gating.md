# Idea: Gating agent-driven LLM spend

**Status:** scoped, not implemented — parked thread.

## Problem

When Claude Code (or Codex) drives this repo, some commands cause the **freecode app
itself** to hit a provider and spend free quota or real money. We want the agent to use
PTY/menus freely, but to stop short of triggering actual generations without the user's
say-so — ideally without adding friction to the harmless 95% of commands.

## How Claude Code gating works (the mechanism)

- `permissions.allow` / `ask` / `deny` in settings.json. These are **prefix matchers**
  (e.g. `Bash(npm.cmd run eval:*)`), not classifiers — they don't understand shell
  semantics, so pipes / chained commands / variable expansion can slip past them.
- `PreToolUse` **hooks**: a script gets the full tool-call JSON on stdin and returns
  allow/deny/ask after arbitrary logic. This is the real home for a "command classifier."

The initial instinct was a classifier hook. The conclusion below is that classification
is the *wrong primary layer* — better as a secondary gate.

## Where spend actually happens (grounded in the repo)

Token-spending calls are exactly two `fetch`es:

- `src/providers/adapters/anthropic.ts:187`
- `src/providers/adapters/openai-compat.ts:229`

Reached only when a generation fires: `npm run eval`, or a prompt submitted to the agent
(via the binary or `pty:session send`).

Separately, `registry.ts` and `pricing-verifier.ts` fetch model lists / pricing — these
hit provider APIs but spend **no tokens**. Open question: do we count those as
"LLM calls" to gate, or are they fine? (Leaning: fine.)

Keys are loaded only from `*_API_KEY` env vars or `$FREECODE_HOME/...` config
(`src/config/index.ts:46,75`).

## Why a text classifier leaks: the `$'\r'` problem

`pty:session send <id> $'\r'` sends one byte (`0x0D`). What it does depends entirely on
TUI state, which the argv does not carry. From `docs/pty-session.md`, the same `$'\r'`:

- `:85` — selects a row in the model picker (no LLM)
- `:95` — runs a slash command like `/help` (no LLM)
- `:101` — submits a prompt to the agent (spends)

And the spend case can be split so the argv looks innocent:

```
send $ID "list the files here"   # types into buffer — no newline, looks harmless
send $ID $'\r'                   # bare Enter that actually submits
```

To catch this, a hook would have to be **stateful** — track buffer contents across calls
and model the TUI's mode — i.e. reimplement the terminal state machine inside the
permission layer. Fragile, large surface.

## Recommended design: kill-switch first, declarative gate second

1. **Kill-switch at the source (robust, no parsing).** Run agent-driven freecode with no
   `*_API_KEY` in the shell env. Then a stray submitting `\r` hits a keyless provider and
   fails for free; PTY menu-driving still works 100%. The ambiguity stops *mattering*
   instead of having to be solved.
   - Bonus: `pty:session` already gives each session an isolated temp `FREECODE_HOME`
     (`docs/pty-session.md:115`), so config-file keys are already ignored. The only
     remaining leak is inherited env `*_API_KEY` vars — which the kill-switch closes.

2. **Declarative gate (cheap suspenders).** `ask` (or `deny`) rules on the *intentional*
   generate entrypoints — `Bash(npm.cmd run eval:*)`, `Bash(npm run eval:*)`, the `/eval`
   skill. Matches the existing CLAUDE.md "don't run evals without asking" rule.

The kill-switch is what lets the declarative gate be imperfect — it covers the PTY-prompt
case classification can't.

## Codex (deferred)

Codex has no equally-flexible hook system, so the env kill-switch ports cleanly while a
classifier wouldn't — another reason to favor it.

## Open questions

- Count free model-list / pricing fetches as gated "LLM calls", or allow them?
- Where to set the keyless env — a wrapper script, Claude Code env settings, or per-command?
- Do we ever need a deliberate opt-in path for a real call, and how is it triggered?

## Next step if resumed

Sketch the concrete settings.json `ask`/`deny` rules + the env-wrapper that strips
`*_API_KEY` for agent-driven freecode runs.
