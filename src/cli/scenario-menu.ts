import { existsSync, readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import {
  PLAYGROUND_EVAL_DIR,
  computeRunHash,
} from "../eval/playground.js";
import {
  getEvalStatus,
  getLatestEvalEntry,
  type EvalHistoryEntry,
  type ScenarioHashes,
} from "../eval/history.js";
export { getEvalStatus };
export type { ScenarioHashes };
import type { PlaygroundScenario } from "../eval/playground.js";

import {
  setModelStatus,
  setQuotaSnapshot,
  setRetryBanner,
  setTokenCount,
} from "./terminal-ui.js";
import { VIEWPORT_SIZE, clampViewport, type MenuTab } from "./list-menu.js";
import {
  loadEvalConfig,
  startEvalScenario,
  resetEvalWorkDir,
  archiveEvalRun,
  runCheckScript,
  type EvalRunResult,
} from "../eval/runner.js";
import { extractApiErrors } from "../eval/errors.js";
import {
  buildEvalPickerScreen,
  buildEvalDetailScreen,
  printEvalHeader,
  printEvalReport,
  printEvalSummary,
} from "./eval-screen.js";
import { InlineActionMenu } from "./action-menu.js";
import { appendEvalRun } from "../providers/model-store.js";
import { getDeadIds } from "../providers/model-cache.js";
import { invalidateDeadModel } from "../providers/registry.js";
import { buildSystemPrompt } from "../agent/system-prompt.js";

// Builds the "Custom" eval tab: the playground/eval scenario list with status
// circles, a detail view (\u2192), and a Run/View/Edit action menu (Enter). 'a' runs
// every scenario. Selecting Run closes the menu via `choose(scenarios)`.
export function buildCustomEvalTab<R>(
  scenarios: PlaygroundScenario[],
  evalHistory: EvalHistoryEntry[],
  scenarioHashes: Map<string, ScenarioHashes>,
  getSelectedModel: () => string,
  choose: (scenarios: PlaygroundScenario[]) => R,
): MenuTab<R> {
  const actionMenu = new InlineActionMenu(["Run", "View", "Edit"]);
  let viewportStart = 0;
  return {
    id: "custom",
    label: "Custom",
    count: () => scenarios.length,
    renderBody: (selected) => {
      // `selected` is -1 when the tab row is focused; clamp the viewport math to
      // a real item while still passing the raw value through so no row highlights.
      const sel = Math.max(0, selected);
      viewportStart = clampViewport(sel, viewportStart);
      const viewportEnd = Math.min(viewportStart + VIEWPORT_SIZE, scenarios.length);
      const visible = scenarios.slice(viewportStart, viewportEnd);
      return {
        lines: buildEvalPickerScreen(
          visible,
          selected < 0 ? -1 : sel - viewportStart,
          evalHistory,
          getSelectedModel(),
          scenarioHashes,
        ),
        selectedLineIdx: 4 + (sel - viewportStart),
        hintLineIdx: 2,
      };
    },
    renderDetail: (selected) => {
      const s = scenarios[selected];
      const h = scenarioHashes.get(s.id);
      const entry = getLatestEvalEntry(
        s.id,
        h?.runHash ?? "",
        getSelectedModel(),
        evalHistory,
        h?.fullHash,
      );
      return buildEvalDetailScreen(s, entry, getSelectedModel());
    },
    actionMenu: {
      menu: actionMenu,
      actionHint: `  ${chalk.dim("\u2191/\u2193 action, Enter select, Esc back")}`,
      onSelect: (option, ctx) => {
        if (option === "Run") ctx.close(choose([scenarios[ctx.getSelected()]]));
        else if (option === "View") ctx.enterDetail();
        // Edit: stub \u2014 the base exits the action menu and redraws.
      },
    },
    onKey: (key, ctx) => {
      if (key === "a" || key === "A") { ctx.close(choose([...scenarios])); return true; }
      return false;
    },
  };
}

// Runs the chosen eval scenarios: resets each work dir, spawns the agent
// subprocess, scores via the scenario's check.ts, persists results, and prints a
// summary when more than one scenario ran.
export async function runEvalScenarios(
  chosen: PlaygroundScenario[],
  model: string,
): Promise<void> {
  let passed = 0;
  let failed = 0;
  let incomplete = 0;

  for (const scenario of chosen) {
    const startMs = Date.now();
    const scenarioDir = join(PLAYGROUND_EVAL_DIR, scenario.id);
    const promptPath = join(scenarioDir, "prompt.md");
    const checkPath = join(scenarioDir, "eval", "check.ts");

    if (!existsSync(promptPath) || !existsSync(checkPath)) {
      console.log(
        chalk.yellow(
          `SKIP  ${scenario.id}  (missing prompt.md or eval/check.ts)`,
        ),
      );
      continue;
    }

    const prompt = readFileSync(promptPath, "utf-8").trim();

    printEvalHeader(scenario.id, prompt);

    resetEvalWorkDir(scenarioDir);
    const maxToolCalls = loadEvalConfig(scenarioDir).maxToolCalls ?? 10;
    let result: EvalRunResult;
    const handle = startEvalScenario(scenarioDir, prompt, model || undefined);

    // Poll result.json and retry-status.json every 500ms so the footer reflects
    // live quota/token counts and the rate-limit cooldown banner during the run.
    const liveStatusPoll = setInterval(() => {
      try {
        if (existsSync(handle.retryStatusFile)) {
          const raw = readFileSync(handle.retryStatusFile, "utf-8").trim();
          if (raw)
            setRetryBanner(
              JSON.parse(raw) as {
                name: string;
                label: string;
                targetMs: number;
              } | null,
            );
        }
      } catch (err) {
        process.stderr.write(
          `[poll] retry status read failed: ${String(err)}\n`,
        );
      }
      try {
        if (existsSync(handle.resultFile)) {
          interface AgentEntry {
            totalTokens?: number;
            providerId?: string;
            modelId?: string;
            quota?: unknown;
          }
          const entries = JSON.parse(
            readFileSync(handle.resultFile, "utf-8"),
          ) as AgentEntry[];
          const last = entries[entries.length - 1];
          if (last) {
            if (last.totalTokens !== undefined)
              setTokenCount(last.totalTokens);
            if (last.providerId && last.modelId)
              setModelStatus(last.providerId, last.modelId);
            else if (last.modelId) setModelStatus("", last.modelId);
            if (Array.isArray(last.quota)) setQuotaSnapshot(last.quota);
          }
        }
      } catch (err) {
        process.stderr.write(
          `[poll] result file read failed: ${String(err)}\n`,
        );
      }
    }, 500);

    try {
      result = await handle.promise;
    } finally {
      clearInterval(liveStatusPoll);
      setRetryBanner(null);
    }

    // Sync dead-model state written by the subprocess back to this process.
    // If the subprocess wrote the model to deadIds (e.g. a 404), remove it
    // from the picker here and skip persisting the result to the DB.
    {
      const deadColonIdx = (model || "").indexOf(":");
      if (deadColonIdx !== -1) {
        const deadProviderId = (model || "").slice(0, deadColonIdx);
        const deadModelId = (model || "").slice(deadColonIdx + 1);
        if (getDeadIds(deadProviderId).includes(deadModelId)) {
          invalidateDeadModel(deadProviderId, deadModelId);
          incomplete++;
          continue;
        }
      }
    }

    const evalModel = model || "";
    const colonIdx = evalModel.indexOf(":");
    if (colonIdx !== -1)
      setModelStatus(
        evalModel.slice(0, colonIdx),
        evalModel.slice(colonIdx + 1),
      );
    else if (evalModel) setModelStatus("", evalModel);
    setTokenCount(result.tokens.total);
    setQuotaSnapshot(Array.isArray(result.quota) ? result.quota : null);

    if (!result.stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim()) {
      console.log(chalk.dim("(no output)"));
    }

    const apiErrors = extractApiErrors(result.stdout);
    if (apiErrors.length > 0) {
      console.log(chalk.red.bold("\nModel API error:"));
      for (const err of apiErrors) {
        const label = err.code ?? err.type ?? "error";
        console.log(chalk.red(`  [${label}] ${err.message}`));
        if (err.type) console.log(chalk.red(`    type: ${err.type}`));
        if (err.param) console.log(chalk.red(`    param: ${err.param}`));
        if (err.failedGeneration)
          console.log(
            chalk.red(`    failed_generation: ${err.failedGeneration}`),
          );
        if (err.diagnosis)
          console.log(chalk.red(`    diagnosis: ${err.diagnosis}`));
      }
    }

    if (result.exitCode !== 0) {
      console.log(
        chalk.yellow(
          `\nINCOMPLETE  ${chalk.bold(scenario.id)}  (agent did not finish — circle status unchanged)`,
        ),
      );
      const reason =
        result.exitCode === 1 && result.toolCalls.length >= maxToolCalls
          ? `exit ${result.exitCode} — hit the ${maxToolCalls}-tool-call limit without finishing`
          : `exit ${result.exitCode}`;
      console.log(chalk.yellow(`  reason: ${reason}`));
      console.log(
        chalk.yellow(
          `  tool calls: ${result.toolCalls.length}${maxToolCalls ? `/${maxToolCalls}` : ""}`,
        ),
      );

      const stripAnsiText = (s: string) =>
        s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const tail = (text: string, n: number): string =>
        stripAnsiText(text)
          .split("\n")
          .filter((l) => l.trim())
          .slice(-n)
          .join("\n");

      const stderrTail = tail(result.stderr, 20);
      if (stderrTail) {
        console.log(chalk.red("  stderr (last 20 lines):"));
        for (const line of stderrTail.split("\n"))
          console.log(chalk.red(`    ${line}`));
      }

      const lastCall = result.toolCalls[result.toolCalls.length - 1];
      if (lastCall) {
        const lastResult =
          typeof lastCall.result === "string"
            ? lastCall.result
            : JSON.stringify(lastCall.result ?? "");
        console.log(
          chalk.yellow(
            `  last tool: ${lastCall.tool}(${JSON.stringify(lastCall.args)})`,
          ),
        );
        if (lastResult)
          console.log(
            chalk.yellow(
              `    → ${lastResult.split("\n").slice(0, 3).join(" ⏎ ")}`,
            ),
          );
      }

      if (!stderrTail) {
        const stdoutTail = tail(result.stdout, 10);
        if (stdoutTail) {
          console.log(chalk.dim("  stdout (last 10 lines):"));
          for (const line of stdoutTail.split("\n"))
            console.log(chalk.dim(`    ${line}`));
        }
      }

      incomplete++;
      continue;
    }

    const report = runCheckScript(scenario.id, scenarioDir, result);

    const allPassed = report.checks
      .filter((c) => c.kind === "assertion")
      .every((c) => c.pass);
    const hasWarnings = report.checks.some(
      (c) => c.kind === "warning" && !c.pass,
    );

    printEvalReport(report);

    archiveEvalRun(scenarioDir, model, result);

    const ts = new Date().toISOString();

    const failedChecks = report.checks.filter(
      (c) => c.kind === "assertion" && !c.pass,
    );
    const failReason = !allPassed && failedChecks.length > 0
      ? failedChecks
          .map((c) => c.name + (c.message ? `: ${c.message}` : ""))
          .join("; ")
      : undefined;
    const transcriptTurn = {
      systemPrompt: buildSystemPrompt(),
      userMessage: prompt,
      tokenUsage: { input: result.tokens.prompt, output: result.tokens.output },
      toolCalls: result.toolCalls,
    };
    appendEvalRun(
      model || "",
      "custom",
      {
        timestamp: ts,
        taskId: scenario.id,
        pass: allPassed,
        turns: result.toolCalls.length,
        tokenUsage: { input: result.tokens.prompt, output: result.tokens.output },
        totalTokens: result.tokens.total,
        durationMs: Date.now() - startMs,
        error: null,
        warnings: allPassed && hasWarnings,
        scenarioHash: computeRunHash(scenarioDir),
        checks: report.checks,
      },
      {
        pass: allPassed,
        ...(failReason !== undefined ? { failReason } : {}),
        freecodeVersion: null,
        transcript: [transcriptTurn],
        scoringOutcome: report.checks,
      },
    );

    if (allPassed) passed++;
    else failed++;
  }

  if (chosen.length > 1) printEvalSummary(passed, failed, incomplete);
}
