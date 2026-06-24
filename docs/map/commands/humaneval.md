---
file: src/commands/humaneval.ts
---

# humaneval.ts

Implements the `/humaneval` slash command.

**Purpose:** Reads the HumanEval benchmark (`playground/humaneval/data/HumanEval.jsonl.gz`) and provides the **HumanEval tab** of the unified eval menu: the picker tab (`buildHumanEvalTab`), the run loop (`runHumanEvalProblems`), the dataset helpers (`ensureHumanEvalDataset`, `loadHumanEvalProblems`, `printHumanEvalList`), and the Python-based scorer. The `/humaneval` slash command itself is composed in `cli/eval-menu.ts` (which opens this tab); this file no longer owns the menu chrome or the `runRawPicker` loop.

**Read when:** Modifying the HumanEval tab or runner, changing how solutions are prompted or checked, or changing per-problem result tracking.

**Exports:** `buildHumanEvalTab(problems, results, choose)`, `runHumanEvalProblems(chosen, model, rl)`, `ensureHumanEvalDataset(downloadFn?)`, `loadHumanEvalProblems()`, `printHumanEvalList(problems)`, `humanEvalDatasetPath()`, `downloadFile(url, dest)`, `readProblems()`, and the `HumanEvalProblem` / `HumanEvalResultMap` types.

**Key neighbors:**
- `src/cli/eval-menu.ts` — composes this tab into `/eval` + `/humaneval`
- `src/cli/list-menu.ts` — `MenuTab` shape returned by `buildHumanEvalTab`
- `src/cli/eval-runner.ts` — `startEvalScenario`, `resetEvalWorkDir`
- `src/cli/eval-screen.ts` — `printEvalHeader` (shared header/prompt rendering)
- `src/cli/terminal-ui.ts` — bottom UI lifecycle, eval-running indicator
- `src/cli/eval-dots.ts` — `statusCircle` (colored dot renderer) reused for picker dots
- `src/providers/model-store.ts` — `appendEvalRun` (records each run to `.freecode/`), `getHumanEvalResults` (derives pass/fail dots per taskId)
- `playground/humaneval/` — cloned openai/human-eval repo (not tracked in git; gitignored under `playground/*`)
- `tests/scenarios/tty-humaneval-fake.scenario.json` — end-to-end fake-LLM TTY test; uses `tests/scenarios/humaneval-mini.jsonl.gz` as bundled single-problem dataset via `HUMANEVAL_DATA` env var

**Result persistence:** Each run is stored in `.freecode/models.json` (summary) and `.freecode/evals/humaneval/{provider}-{modelId}/{timestamp}.json` (full transcript + scoring). The `transcript` field is an array of turn objects, each with `systemPrompt`, `userMessage`, `tokenUsage: { input?, output? }`, and `toolCalls`. For humaneval (single-turn evals) the array always has exactly one entry. The legacy `playground/humaneval/.runs/.results/` directory has been removed.

**Update triggers:** Prompt wording changes, Python check logic, viewport size, run-dir layout, dot rendering, result persistence format, the HumanEval tab/menu composition (see `cli/eval-menu.ts`), or `HUMANEVAL_DATA` env var override (used in tests to point at the bundled mini fixture).
