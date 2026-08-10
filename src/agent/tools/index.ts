/**
 * @role Declares which tools exist and which of them a given turn is offered, and assembles them through the wrapper stack. What happens *around* each call — rationale, confirmation, rendering, turn stop, serialization — lives in [wrappers.md](wrappers.md).
 *
 * @readwhen
 * - Adding a new tool to the offered set by registering it in `READ_ONLY_TOOL_DEFS` or `WRITE_TOOL_DEFS`.
 * - Changing which tools read-only mode offers via the `READ_ONLY_TOOL_DEFS` partition and early return.
 * - Debugging why `spawn_agent` is absent on a path, since only agent/loop.ts injects it.
 */

// Which tools exist, and which of them a given turn is offered. What happens
// around each call — confirmation, rendering, turn stop, serialisation — lives
// in `wrappers.ts`.

import { readFileTool } from "./read.js";
import { createFileTool } from "./create.js";
import { editTool } from "./edit.js";
import { grepTool } from "./grep.js";
import { shellTool } from "./shell.js";
import { listDirTool } from "./list-dir.js";
import { makeSpawnAgentTool, type SpawnAgentFn } from "./spawn-agent.js";
import type { ReadOnlyToolName, WriteToolName } from "./tool-names.js";
import { loadConfig } from "../../config/index.js";
import {
  createToolExecutionQueue,
  createTurnStopState,
  wrap,
  type AnyCoreTool,
  type ConfirmToolCall,
} from "./wrappers.js";

export type {
  ConfirmToolCall,
  ToolCallConfirmation,
  ToolCallPreview,
} from "./wrappers.js";

/**
 * The name -> tool maps behind the partition declared in tools/tool-names.ts.
 * Read-only mode (the Ctrl+R toggle and `-p`) offers only READ_ONLY_TOOL_DEFS.
 *
 * A read-only tool's action is also, by definition, safe to run BEFORE the user
 * confirms it: the preview shown in the approval UI is the actual result, reused
 * on approval instead of re-executing (see withConfirmation). That is why the
 * precompute check *is* `isReadOnlyTool` rather than a second list that happens
 * to agree with it. Never move a tool with a side effect beyond reading into
 * READ_ONLY_TOOL_DEFS — the approval UI would then act before consent.
 */
export const READ_ONLY_TOOL_DEFS: Record<ReadOnlyToolName, AnyCoreTool> = {
  read: readFileTool,
  grep: grepTool,
  list_dir: listDirTool,
};

export const WRITE_TOOL_DEFS: Record<WriteToolName, AnyCoreTool> = {
  create: createFileTool,
  edit: editTool,
  shell_exec: shellTool,
};

export function createTools(
  confirmToolCall?: ConfirmToolCall,
  toolRationale?: boolean,
  parsedTools = false,
  readOnly = false,
  spawnAgent?: SpawnAgentFn,
) {
  const useRationale = toolRationale ?? loadConfig().toolRationale;
  const queueExecution = createToolExecutionQueue();
  // One per tool set, i.e. per streamText attempt: an Esc that stopped the turn
  // must be visible to every other tool in that same turn.
  const stopState = createTurnStopState();
  const wrapAll = (
    defs: Record<string, AnyCoreTool>,
  ): Record<string, AnyCoreTool> =>
    Object.fromEntries(
      Object.entries(defs).map(([name, t]) => [
        name,
        wrap(name, t, useRationale, queueExecution, stopState, confirmToolCall, parsedTools),
      ]),
    );

  const readOnlyTools = wrapAll(READ_ONLY_TOOL_DEFS);
  // Read-only mode offers the read-only half and nothing else. spawn_agent is
  // excluded deliberately even though the sub-agent it runs is itself read-only:
  // a call spends a whole LLM sub-turn, which is more than "reading", and the
  // headless `-p` mode must not be able to fan out.
  if (readOnly) return readOnlyTools;
  return {
    ...readOnlyTools,
    // spawn_agent is only available when the caller injects a model-bound runner
    // (agent/loop.ts). The hand-typed and parsed-tools paths pass none, so it is
    // simply absent there rather than erroring at call time.
    ...(spawnAgent
      ? {
          spawn_agent: wrap(
            "spawn_agent",
            makeSpawnAgentTool(spawnAgent),
            useRationale,
            queueExecution,
            stopState,
            confirmToolCall,
            parsedTools,
            false,
          ),
        }
      : {}),
    ...wrapAll(WRITE_TOOL_DEFS),
  };
}

export { readFileTool, createFileTool, editTool, grepTool, shellTool, listDirTool };
