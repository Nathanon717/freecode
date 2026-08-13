/**
 * @role `freecode -p "<prompt>"` — one non-interactive agent turn whose final response is printed to stdout, read-only unless `--edit` is passed. Built so an LLM can shell out to freecode and read the answer back.
 *
 * @readwhen
 * changing what `-p` prints, its exit codes, or what it is allowed to do.
 */

// `freecode -p "<prompt>"`: one non-interactive agent turn whose final response is
// printed to stdout. Built for LLM callers — an agent shells out to freecode to
// explore a codebase and reads the answer back from stdout.
//
// The contract that makes it composable in `$(...)`:
//
//  - **stdout is the response and nothing else.** The transcript is silenced
//    (`FREECODE_TRANSCRIPT_STREAM=null`) rather than routed elsewhere, and the
//    final text is written here from `result.text`. Progress chatter has nowhere
//    to leak to.
//  - **Failures go to stderr with exit code 1**, so a caller can tell an empty
//    answer from a broken run.
//  - **Read-only by default.** The read-only toggle is forced on, so `createTools`
//    offers read/grep/list_dir only. `--edit` (`edit: true`) turns it off and hands
//    the turn the write half too — create/edit/shell_exec.
//  - **Never spawn_agent.** Read-only drops it anyway; with `--edit` it is dropped
//    explicitly (`spawnAgent: false`), because a headless turn that fans out into
//    sub-turns is a budget nobody is watching. No fan-out in either mode.
//  - **No confirmation.** There is no interactive channel to confirm on, so ask
//    mode is forced to `auto` — the same off switch as Ctrl+A, not a new one. Under
//    `--edit` that means writes and shell commands run unattended; the tool-call
//    budget below is the only stop.
//  - **One `--edit` run per project at a time.** A second is refused until the
//    first one's work has been accepted or reverted, which is what keeps "the
//    newest snapshot" an unambiguous answer to "what did the agent just change".
//    A lock that can be neither claimed nor read is refused too — an unwritable
//    snapshot store must not read as a free project. Read-only `-p` is unaffected:
//    it has nothing to review.
//  - **A run whose snapshot failed keeps the lock and says so on stderr.** It
//    wrote, and nothing covers what it wrote; releasing on that used to be
//    indistinguishable from releasing a run that wrote nothing at all
//    (docs/agent-containment-plan.md, R4). See `settleReviewLock` below.
//  - **The run cannot review itself.** `shell_exec` stamps `FREECODE_SANDBOXED=1`
//    on its children, and `freecode checkpoint accept`/`revert` refuse under it —
//    otherwise one shell command frees the lock, re-baselines the snapshot, and
//    leaves the work unreviewed on disk (docs/agent-containment-plan.md, R1).
//  - **Free models only.** src/index.ts sets `FREECODE_FREE_ONLY=1` for `-p`
//    before any credential loads; see providers/paid-guard.ts.

import type { CoreMessage } from "ai";
import type { AgentLoopResult } from "../agent/loop.js";
import type { ToolCallConfirmation } from "../agent/tools/index.js";
import { getAskMode, initAskMode, initReadOnly, isReadOnly } from "./chrome/toggles.js";

/**
 * Runaway stop for an unattended turn: past the budget every further tool call is
 * denied, so the model winds down and answers instead of looping. The agent loop
 * itself is unbounded (`maxSteps` is unlimited — see agent/loop.ts), and nobody is
 * watching this one.
 */
const DEFAULT_MAX_TOOL_CALLS = 50;

interface TextPartLike {
  type: string;
  text?: unknown;
}

function assistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as TextPartLike[])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

/**
 * The final response, not the whole turn's narration. `result.text` concatenates
 * the text of every step, so a turn that said "Let me look at it." before calling a
 * tool would print that too — and the caller asked for an answer, not a commentary.
 * The last assistant message carrying text is that answer; runSubAgent discards
 * inter-step chatter for the same reason (agent/subagents/run-subagent.ts).
 *
 * An errored turn contributes no messages at all (see agent/loop.ts), so that
 * case falls back to whatever partial text the turn managed to emit.
 */
function finalResponse(result: AgentLoopResult): string {
  for (let i = result.turnMessages.length - 1; i >= 0; i--) {
    const message = result.turnMessages[i];
    if (message.role !== "assistant") continue;
    const text = assistantText(message.content).trim();
    if (text) return text;
  }
  return result.text.trim();
}

export interface HeadlessPromptOptions {
  projectRoot: string;
  prompt: string;
  model: string;
  /** Print one stderr line of cost/timing info after the turn; stdout is untouched. */
  stats?: boolean;
  /** Offer the write tools (create/edit/shell_exec) instead of running read-only. */
  edit?: boolean;
}

/** Resolves to the process exit code. */
export async function runHeadlessPrompt(
  options: HeadlessPromptOptions,
): Promise<number> {
  const { projectRoot, prompt, model, stats, edit } = options;
  const startedAt = Date.now();

  if (!model) {
    process.stderr.write(
      "Error: no model selected. Pass --model provider:model or set FREECODE_MODEL.\n",
    );
    return 1;
  }

  // Claimed before the turn rather than at the first write, so a refusal costs
  // nothing and arrives before any tokens are spent. Released below only if the
  // run turned out to write nothing.
  if (edit) {
    const { claimReviewLock } = await import("../snapshots/review-lock.js");
    const claim = claimReviewLock(projectRoot, prompt.split("\n")[0] ?? "");
    if (claim.status === "held") {
      const { held } = claim;
      process.stderr.write(
        `Error: another \`-p --edit\` run has unreviewed changes in this project ` +
        `(started ${held.startedAt || "unknown"}, pid ${held.pid}): ${held.task}\n` +
        `Review them with \`freecode checkpoint diff\`, then \`freecode checkpoint accept\` ` +
        `or \`freecode checkpoint revert\` before delegating again.\n`,
      );
      return 1;
    }
    // Unknown is refused, not assumed free: see claimReviewLock. Naming the file
    // and the error is the whole difference between a refusal and a mystery.
    if (claim.status === "unavailable") {
      process.stderr.write(
        `Error: the review lock for this project could not be claimed or read, so freecode ` +
        `cannot tell whether another \`-p --edit\` run has unreviewed changes: ${claim.reason}\n` +
        // Only one of the two has a fix from here. `checkpoint accept` — the
        // documented way out of a stuck lock — takes a baseline snapshot, so it
        // needs the very store an unwritable-store failure just proved it cannot
        // write; saying "delete it" there would send someone after the wrong file.
        (claim.cause === "unreadable-lock"
          ? `The lock file ${claim.path} exists but could not be read — a run killed mid-write ` +
            `leaves one like this. Delete it if no delegated run is outstanding, then try again.\n`
          : `The snapshot store under ${claim.path} cannot be written. Nothing in freecode can ` +
            `repair that from here (\`checkpoint accept\` would have to write it too), so fix the ` +
            `directory's permissions or set FREECODE_HOME somewhere writable.\n`),
      );
      return 1;
    }
  }

  process.env["FREECODE_TRANSCRIPT_STREAM"] = "null";
  initReadOnly(!edit);
  initAskMode("auto");

  const maxToolCalls = parseInt(
    process.env["FREECODE_MAX_TOOL_CALLS"] ?? String(DEFAULT_MAX_TOOL_CALLS),
    10,
  );
  let toolCalls = 0;
  const confirmToolCall = (): Promise<ToolCallConfirmation> => {
    toolCalls++;
    if (toolCalls > maxToolCalls) {
      return Promise.resolve({
        approved: false,
        message: `Stopped after tool call limit of ${maxToolCalls}. Answer with what you have.`,
      });
    }
    return Promise.resolve({ approved: getAskMode() === "auto" });
  };

  try {
    // Imported lazily, matching the command dispatcher: the `ai` SDK is ~1.2s to load
    // and the argument-validation exits in src/index.ts must not pay for it.
    const { agentLoop } = await import("../agent/loop.js");
    const messages: CoreMessage[] = [{ role: "user", content: prompt }];
    const result = await agentLoop(messages, projectRoot, model, {
      confirmToolCall,
      readOnly: isReadOnly(),
      spawnAgent: false,
    });

    // agentLoop reports failures on `error` and leaves `text` as whatever the model
    // managed to say first, so print both: partial output is still worth having, but
    // the exit code has to say the run did not complete.
    const text = finalResponse(result);
    if (text) process.stdout.write(`${text}\n`);

    // Printed even when the turn errored: a rate-limited or failed turn still spent
    // tokens, and that is exactly the case a caller most wants visibility into.
    // `usage.promptTokens` is the last step's context size, not a sum of what every
    // step in a multi-step tool turn actually cost (agent/loop.ts) — labeled `ctx=`
    // rather than `prompt=` so it doesn't read as a per-turn total.
    if (stats) {
      const { totalTokens, promptTokens, outputTokens } = result.usage;
      process.stderr.write(
        `stats: model=${result.providerId}:${result.modelId} ctx=${promptTokens ?? 0} ` +
        `output=${outputTokens ?? 0} total=${totalTokens} toolCalls=${toolCalls} ` +
        `wallTimeMs=${Date.now() - startedAt}\n`,
      );
    }

    if (result.error) {
      process.stderr.write(`Error: ${result.error}\n`);
      return 1;
    }
    return 0;
  } finally {
    if (edit) await settleReviewLock(projectRoot);
  }
}

/**
 * Frees the project, records the snapshot, or reports that there is none —
 * exactly one of the three, on the way out of an `--edit` run.
 *
 * The condition has one owner: snapshots/auto.ts already knows how this process's
 * snapshot went, and asking it is what keeps a second flag here from ever
 * disagreeing. What R4 changed is that it can now answer *three* ways. `none`
 * frees the project immediately — nothing was written, so there is nothing to
 * review. `taken` keeps the lock and writes the id into it, so `checkpoint` can
 * name this run's snapshot rather than infer one.
 *
 * `failed` is the case that used to be silently identical to `none`, and it is the
 * worst of the three: the writes landed, no snapshot covers them, and the lock was
 * being released — so the project was marked free precisely when it was least
 * reviewable, and the failure went to a log that `-p` silences. It now keeps the
 * lock and says so on stderr, where a caller composing `$(freecode -p ...)` still
 * sees it without stdout's answer being polluted.
 */
async function settleReviewLock(projectRoot: string): Promise<void> {
  const { sessionSnapshot } = await import("../snapshots/auto.js");
  const snapshot = await sessionSnapshot();
  const { recordLockSnapshot, releaseReviewLock } = await import("../snapshots/review-lock.js");

  if (snapshot.status === "none") return releaseReviewLock(projectRoot);
  if (snapshot.status === "taken") return recordLockSnapshot(projectRoot, { snapshotId: snapshot.id });

  recordLockSnapshot(projectRoot, { snapshotFailed: true });
  process.stderr.write(
    `Error: this run changed the project, but freecode could not take the checkpoint snapshot ` +
    `that its changes would have been reviewed against (${snapshot.reason}).\n` +
    `Nothing was lost, and nothing is protected either: \`freecode checkpoint diff\` has no ` +
    `baseline for this run and \`freecode checkpoint revert\` cannot undo it.\n` +
    `The project stays locked so no further \`-p --edit\` run starts against an unreviewable ` +
    `state. Review the changes with \`git status\` and \`git diff\`, then \`freecode checkpoint ` +
    `accept\` to clear the lock.\n`,
  );
}
