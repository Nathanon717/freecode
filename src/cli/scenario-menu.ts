import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Interface } from "readline";
import chalk from "chalk";
import {
  PLAYGROUND_EVAL_DIR,
  discoverPlaygroundScenarios,
  computeRunHash,
  computeScenarioHash,
  getEvalStatus,
  getLatestEvalEntry,
  statusCircle,
  loadEvalHistory,
  type PlaygroundScenario,
  type ScenarioHashes,
} from "./eval-dots.js";
export { getEvalStatus };

import {
  isBottomUIActive,
  setModelStatus,
  setQuotaSnapshot,
  setRetryBanner,
  setTokenCount,
  setupBottomUI,
  teardownBottomUI,
} from "./terminal-ui.js";
import {
  countWrappedLines,
  resetStdinConsoleMode,
  resetTerminalPrivateModes,
  runRawPicker,
} from "./raw-picker.js";
import { redrawBanner } from "./banner.js";
import {
  loadEvalConfig,
  startEvalScenario,
  resetEvalWorkDir,
  archiveEvalRun,
  runCheckScript,
  type EvalRunResult,
} from "./eval-runner.js";
import { extractApiErrors } from "./eval-errors.js";
import {
  buildEvalPickerScreen,
  buildEvalDetailScreen,
  printEvalHeader,
  printEvalReport,
} from "./eval-screen.js";
import { InlineActionMenu } from "./action-menu.js";
import { appendEvalRun } from "../providers/model-store.js";
import { buildSystemPrompt } from "../agent/system-prompt.js";

export async function runEvalMenu(
  rl: Interface,
  projectRoot: string,
  getSelectedModel: () => string,
): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = discoverPlaygroundScenarios();
    if (scenarios.length === 0) {
      console.log(chalk.yellow("No eval scenarios found in playground/eval/."));
      return;
    }

    const evalHistory = loadEvalHistory();
    const scenarioHashes = new Map(
      scenarios.map((s) => {
        const dir = join(PLAYGROUND_EVAL_DIR, s.id);
        return [
          s.id,
          { runHash: computeRunHash(dir), fullHash: computeScenarioHash(dir) },
        ];
      }),
    );

    if (!process.stdin.isTTY) {
      console.log(chalk.bold("Eval scenarios\n"));
      const model = getSelectedModel();
      for (const s of scenarios) {
        const h = scenarioHashes.get(s.id);
        const circle = statusCircle(
          getEvalStatus(
            s.id,
            h?.runHash ?? "",
            model,
            evalHistory,
            h?.fullHash,
          ),
        );
        console.log(
          `  ${circle} ${chalk.cyan(s.id)}  ${chalk.gray(s.firstLine)}`,
        );
      }
      return;
    }

    let pickerSel = 0;
    let detailMode = false;
    let actionMode = false;
    const actionMenu = new InlineActionMenu(["Run", "View", "Edit"]);

    const chosen = await runRawPicker<PlaygroundScenario[] | null>(rl, {
      render: () => {
        if (detailMode) {
          const s = scenarios[pickerSel];
          const h = scenarioHashes.get(s.id);
          const entry = getLatestEvalEntry(
            s.id,
            h?.runHash ?? "",
            getSelectedModel(),
            evalHistory,
            h?.fullHash,
          );
          return buildEvalDetailScreen(s, entry, getSelectedModel());
        }
        const screen = buildEvalPickerScreen(
          scenarios,
          pickerSel,
          evalHistory,
          getSelectedModel(),
          scenarioHashes,
        );
        if (actionMode) {
          screen.splice(4 + pickerSel + 1, 0, ...actionMenu.renderLines());
          screen[2] = `  ${chalk.dim("\u2191/\u2193 action, Enter select, Esc back")}`;
        }
        return screen;
      },
      countLines: countWrappedLines,
      onKey(key, redraw, close) {
        if (detailMode) {
          if (key === "\x1b" || key === "\x1b[D") {
            detailMode = false;
            redraw();
            return;
          }
          return;
        }
        if (actionMode) {
          const result = actionMenu.handleKey(key);
          if (result.type === 'close') {
            actionMode = false;
            redraw();
          } else if (result.type === 'select') {
            if (result.option === 'Run') {
              close([scenarios[pickerSel]]);
            } else if (result.option === 'View') {
              actionMode = false;
              detailMode = true;
              redraw();
            } else {
              // Edit: stub \u2014 close sub-menu and redraw
              actionMode = false;
              redraw();
            }
          } else {
            redraw();
          }
          return;
        }
        if (key === "\x1b") {
          close(null);
          return;
        }
        if (key === "\x1b[A") {
          pickerSel = (pickerSel - 1 + scenarios.length) % scenarios.length;
          redraw();
          return;
        }
        if (key === "\x1b[B") {
          pickerSel = (pickerSel + 1) % scenarios.length;
          redraw();
          return;
        }
        if (key === "\x1b[C") {
          detailMode = true;
          redraw();
          return;
        }
        if (key === "\r" || key === "\n") {
          actionMode = true;
          actionMenu.reset();
          redraw();
          return;
        }
        if (key === "a" || key === "A") {
          close([...scenarios]);
          return;
        }
      },
    });

    if (!chosen) {
      if (process.stdin.isTTY) redrawBanner();
      return;
    }

    const model = getSelectedModel();
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

    if (chosen.length > 1) {
      console.log("");
      const parts = [
        passed > 0 ? chalk.green(`${passed} passed`) : null,
        failed > 0 ? chalk.red(`${failed} failed`) : null,
        incomplete > 0 ? chalk.yellow(`${incomplete} incomplete`) : null,
      ].filter(Boolean);
      const color =
        failed > 0 ? chalk.red : incomplete > 0 ? chalk.yellow : chalk.green;
      console.log(color(`Results: ${parts.join(", ")}`));
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) {
      resetStdinConsoleMode();
      resetTerminalPrivateModes();
      setupBottomUI();
    }
  }
}
