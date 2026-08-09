/**
 * @role Builds the deterministic `--script` `CliSessionMode` used by eval subprocesses and non-interactive runs — reads inputs and tool-approval choices from a file instead of a live TTY. Split out of `session-modes.ts` at the 500-line limit as the self-contained non-interactive counterpart to `createInteractiveMode`.
 *
 * @readwhen
 * - Changing how `--script` runs consume input or approve tools, or how eval subprocesses are driven unattended.
 */

import { readFileSync } from "fs";
import chalk from "chalk";
import type { ToolCallConfirmation } from "../agent/tools/index.js";
import type { CliSessionMode } from "./session-runner.js";
import {
  formatScriptedToolMenu,
  parseScriptedToolChoice,
} from "./tools/tool-approval.js";

export function createScriptedMode(scriptPath: string): CliSessionMode {
  const lines = readFileSync(scriptPath, "utf-8")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('"')) {
        try {
          return JSON.parse(line) as string;
        } catch { /* ignore */ }
      }
      return line;
    });
  let lineIdx = 0;

  const autoConfirm = process.env["FREECODE_AUTO_CONFIRM"] === "1";
  const maxToolCalls = parseInt(
    process.env["FREECODE_MAX_TOOL_CALLS"] ?? "10",
    10,
  );
  let autoCallCount = 0;

  return {
    readInput: (): Promise<string | null> => {
      if (lineIdx >= lines.length) return Promise.resolve(null);
      const line = lines[lineIdx++];
      return Promise.resolve(line);
    },
    // Not `async` (the body has nothing to await, which require-await forbids);
    // returns the confirmation wrapped in a resolved Promise instead.
    confirmToolCall: (_preview): Promise<ToolCallConfirmation> => {
      if (autoConfirm) {
        autoCallCount++;
        // Hard cap for unattended runs: once past the budget, deny every further
        // call so the agent (already bounded by the loop's maxSteps) winds down
        // rather than running unbounded. No prompt — scripted stdin is closed.
        if (autoCallCount > maxToolCalls) {
          return Promise.resolve({
            approved: false,
            message: `Stopped after tool call limit of ${maxToolCalls}.`,
          });
        }
        process.stderr.write(chalk.dim("Auto-approved.\n"));
        return Promise.resolve({ approved: true });
      }

      const choice = parseScriptedToolChoice(lines[lineIdx]);
      if (choice) {
        const rawChoice = lines[lineIdx]?.trim() ?? "";
        lineIdx++;
        formatScriptedToolMenu(choice);
        console.log(chalk.dim(`Scripted selection: ${rawChoice}`));

        if (choice === "approve") return Promise.resolve({ approved: true });

        const message = lines[lineIdx] ?? "";
        if (message) {
          lineIdx++;
          console.log(
            chalk.yellow(`Tell the agent what to do instead: ${message}`),
          );
        } else {
          console.log(chalk.yellow("Tell the agent what to do instead:"));
        }
        return Promise.resolve({ approved: false, message });
      }

      formatScriptedToolMenu("deny");
      console.log(
        chalk.dim("No scripted approval provided; denying tool call."),
      );
      return Promise.resolve({ approved: false });
    },
    modelListMode: "current-only",
    skipStrayConfirmations: true,
    runEvalMenu: (): Promise<void> => {
      console.log(chalk.dim("/eval is not available in scripted mode."));
      return Promise.resolve();
    },
    onInputExhausted: () => {
      if (!process.env.FREECODE_AUTO_CONFIRM) {
        console.log(chalk.dim("Goodbye!"));
      }
    },
  };
}
