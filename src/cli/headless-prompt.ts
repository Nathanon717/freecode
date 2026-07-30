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
//  - **Read-only.** The read-only toggle is forced on, so `createTools` offers
//    read/grep/list_dir and drops spawn_agent — no writes, no shell, no fan-out.
//  - **No confirmation.** There is no interactive channel to confirm on, so ask
//    mode is forced to `auto` — the same off switch as Ctrl+A, not a new one.
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
 * An errored or aborted turn contributes no messages at all (see agent/loop.ts), so
 * that case falls back to whatever partial text the turn managed to emit.
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
}

/** Resolves to the process exit code. */
export async function runHeadlessPrompt(
  options: HeadlessPromptOptions,
): Promise<number> {
  const { projectRoot, prompt, model } = options;

  if (!model) {
    process.stderr.write(
      "Error: no model selected. Pass --model provider:model or set FREECODE_MODEL.\n",
    );
    return 1;
  }

  process.env["FREECODE_TRANSCRIPT_STREAM"] = "null";
  initReadOnly(true);
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

  // Imported lazily, matching the command dispatcher: the `ai` SDK is ~1.2s to load
  // and the argument-validation exits in src/index.ts must not pay for it.
  const { agentLoop } = await import("../agent/loop.js");
  const messages: CoreMessage[] = [{ role: "user", content: prompt }];
  const result = await agentLoop(messages, projectRoot, model, {
    confirmToolCall,
    readOnly: isReadOnly(),
  });

  // agentLoop reports failures on `error` and leaves `text` as whatever the model
  // managed to say first, so print both: partial output is still worth having, but
  // the exit code has to say the run did not complete.
  const text = finalResponse(result);
  if (text) process.stdout.write(`${text}\n`);
  if (result.error) {
    process.stderr.write(`Error: ${result.error}\n`);
    return 1;
  }
  return 0;
}
