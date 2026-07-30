# src/cli/headless-prompt.ts - Headless Prompt Mode (`-p`)

**Role:** `freecode -p "<prompt>"` — one non-interactive, read-only agent turn whose final response is printed to stdout. Built so an LLM can shell out to freecode and read the answer back.

**Read when:** changing what `-p` prints, its exit codes, or what it is allowed to do.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface HeadlessPromptOptions {
  projectRoot: string;
  prompt: string;
  model: string;
  /** Print one stderr line of cost/timing info after the turn; stdout is untouched. */
  stats?: boolean;
}

runHeadlessPrompt(options: HeadlessPromptOptions): Promise<number>
```
<!-- END GENERATED EXPORTS -->

## The output contract

This is the part callers depend on; changing it breaks `$(freecode -p ...)`.

- **stdout is the response and nothing else.** The transcript is *silenced*
  (`FREECODE_TRANSCRIPT_STREAM=null`), not redirected, so tool call lines, result
  previews and step dividers have nowhere to leak to. Covered by
  `tests/e2e/prompt-mode.e2e.json`, which asserts the tool really ran while its
  chrome stayed out of stdout.
- **The response is the *final* message, not the whole turn.** `result.text`
  concatenates every step's text, so a turn that says "Let me look at it." before
  calling a tool would print that too. `finalResponse` takes the last assistant
  message carrying text from `result.turnMessages`, falling back to `result.text`
  when the turn contributed no messages (an errored or aborted turn). Same reasoning
  as [../agent/subagents/run-subagent.md](../agent/subagents/run-subagent.md), which
  drops inter-step narration so the caller gets findings, not chatter.
- **Failures go to stderr, exit code 1.** A caller can tell an empty answer from a
  broken run. Partial text still prints when a turn errored after saying something.
- **`--stats` adds one stderr line, stdout stays untouched.** Model, context tokens
  (last step's `promptTokens`, not a per-turn sum — see
  [../agent/loop.md](../agent/loop.md)), output tokens, total tokens, tool-call
  count, and wall time. Printed even on the error path, since a failed or
  rate-limited turn still spent tokens.

## What it is allowed to do

- **Read-only.** Forces the read-only toggle on via `initReadOnly(true)` and passes
  `isReadOnly()` through, so this is the same mechanism as Ctrl+R rather than a
  parallel flag. `createTools` therefore offers `read`/`grep`/`list_dir` and **no
  `spawn_agent`** — see [../agent/tools/index.md](../agent/tools/index.md).
- **No confirmation.** Ask mode is forced to `auto` (`initAskMode('auto')`) — the
  same off switch as Ctrl+A. There is no interactive channel to prompt on.
- **Free models only.** `src/index.ts` sets `FREECODE_FREE_ONLY=1` for `-p` before
  any credential loads; see [../providers/paid-guard.md](../providers/paid-guard.md).
  A paid `--model` is refused with a message naming the flag, exit 1
  (`tests/e2e/prompt-mode-paid-block.e2e.json`).
- **Bounded.** `FREECODE_MAX_TOOL_CALLS` (default 50) denies further calls past the
  budget so an unattended turn winds down and answers. The agent loop itself is
  unbounded, and nobody is watching this one.

## Key neighbors

- `src/index.ts` — validates the flag, rejects `-p` together with `--script`, sets
  the free-only env var, and calls this with the resolved model.
- It calls `agentLoop` **directly** rather than going through
  [session-runner.md](session-runner.md) / [command-dispatcher.md](command-dispatcher.md):
  those print their own progress lines to stdout (`(empty response from model)`,
  provider usage), which the output contract cannot afford.

## Update triggers

- The output contract changes (what stdout carries, exit codes).
- Read-only, confirmation, or free-only enforcement moves.
- `AgentLoopResult` changes shape around `text` / `turnMessages`.
