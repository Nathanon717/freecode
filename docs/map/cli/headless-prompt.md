# src/cli/headless-prompt.ts - Headless Prompt Mode (`-p`)

<!-- BEGIN GENERATED MAP INTENT -->
## Role

`freecode -p "<prompt>"` — one non-interactive agent turn whose final response is printed to stdout, read-only unless `--edit` is passed. Built so an LLM can shell out to freecode and read the answer back.

## Read When

changing what `-p` prints, its exit codes, or what it is allowed to do.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface HeadlessPromptOptions {
  projectRoot: string;
  prompt: string;
  model: string;
  /** Print one stderr line of cost/timing info after the turn; stdout is untouched. */
  stats?: boolean;
  /** Offer the write tools (create/edit/shell_exec) instead of running read-only. */
  edit?: boolean;
}

/**
 * Resolves to the process exit code.
 */
runHeadlessPrompt(options: HeadlessPromptOptions): Promise<number>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/toggles.ts`](chrome/toggles.md) ×4, [`agent/loop.ts`](../agent/loop.md) ×1, [`agent/tools/index.ts`](../agent/tools/index.md) ×1

## Tests

`tests/cli/headless-prompt.test.ts`.

## Budget

245 / 500 lines (255 to spare).

## Env

`FREECODE_MAX_TOOL_CALLS`, `FREECODE_TRANSCRIPT_STREAM`
<!-- END GENERATED MAP FACTS -->

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
  when the turn contributed no messages (an errored turn). Same reasoning
  as [../agent/subagents/run-subagent.md](../agent/subagents/run-subagent.md), which
  drops inter-step narration so the caller gets findings, not chatter.
- **Failures go to stderr, exit code 1.** A caller can tell an empty answer from a
  broken run. Partial text still prints when a turn errored after saying something.
- **`--stats` adds one stderr line, stdout stays untouched.** Model, context tokens
  (last step's `promptTokens`, not a per-turn sum — see
  [../agent/loop.md](../agent/loop.md)), output tokens, total tokens, tool-call
  count, and wall time. Printed even on the error path, since a failed or
  rate-limited turn still spent tokens.

## One `--edit` run per project at a time

An edit-enabled run claims the lock in [../snapshots/review-lock.md](../snapshots/review-lock.md)
**before the turn**, so a refusal costs no tokens, and exits 1 naming the holder and the task
it was given. Read-only `-p` neither claims nor checks — it has nothing to review.

The release lives in a `finally` and asks `sessionSnapshot()` in
[../snapshots/auto.md](../snapshots/auto.md) rather than tracking a flag of its own: that
module already knows how this process's snapshot went, and two flags can disagree while one
cannot. It answers three ways, and `settleReviewLock` does exactly one thing per answer:

| Answer | Effect |
| --- | --- |
| `none` — wrote nothing | frees the project on the way out |
| `taken` | keeps the lock and records the snapshot id in it |
| `failed` — wrote, no snapshot | keeps the lock and reports it on stderr |

A run that wrote keeps the lock whether it then succeeded, errored, or threw — an errored run's
changes are the ones most worth looking at before anything else touches the project.

`failed` is R4. It used to be indistinguishable from `none`, because the question asked was "is
there an id?" — so a run that wrote while its snapshot store was broken **released the lock**,
marking the project free over changes nothing covers, and the only record of the failure went to
a log that `-p` silences (findings A5/A6). The report goes to stderr, not stdout, so the output
contract above survives it; the exit code still belongs to the turn, because the turn itself
succeeded. `tests/e2e/prompt-mode-edit-snapshot-failure.e2e.json` covers it against the real
binary, breaking the store with `GIT_OBJECT_DIRECTORY` — which fails every shadow-repo git call
while leaving the lock file, plain `fs` and no git, claimable.

It calls `agentLoop` directly rather than going through
[session-runner.md](session-runner.md) or [command-dispatcher.md](command-dispatcher.md):
those print their own progress lines to stdout (`(empty response from model)`, provider
usage), which this contract cannot afford.

## What it is allowed to do

- **Read-only unless `--edit`.** `initReadOnly(!edit)` drives the same toggle as
  Ctrl+R rather than a parallel flag, and `isReadOnly()` is what reaches `agentLoop`.
  Default: `read`/`grep`/`list_dir`. With `edit: true` (`--edit` in `src/index.ts`),
  `createTools` also offers `create`/`edit`/`shell_exec` — see
  [../agent/tools/index.md](../agent/tools/index.md).
- **Never `spawn_agent`.** Read-only drops it on its own; the `--edit` path would get
  it back, so the call passes `spawnAgent: false` explicitly. A headless turn that
  fans out spends whole sub-turns nobody is watching. Pinned in both directions by
  `tests/e2e/prompt-mode.e2e.json` and `tests/e2e/prompt-mode-edit.e2e.json`.
- **No confirmation.** Ask mode is forced to `auto` (`initAskMode('auto')`) — the
  same off switch as Ctrl+A. There is no interactive channel to prompt on. Under
  `--edit` that means writes and shell commands run unattended; the tool-call budget
  below is the only stop.
- **Free models only.** `src/index.ts` sets `FREECODE_FREE_ONLY=1` for `-p` before
  any credential loads; see [../providers/paid-guard.md](../providers/paid-guard.md).
  A paid `--model` is refused with a message naming the flag, exit 1
  (`tests/e2e/prompt-mode-paid-block.e2e.json`).
- **Bounded.** `FREECODE_MAX_TOOL_CALLS` (default 50) denies further calls past the
  budget so an unattended turn winds down and answers. The agent loop itself is
  unbounded, and nobody is watching this one.
