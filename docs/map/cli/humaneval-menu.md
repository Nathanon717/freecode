# src/cli/humaneval-menu.ts - HumanEval Tab + Run Loop

Provides the **HumanEval tab** of the unified `/eval` menu and its run loop.

**Purpose:** Implements the HumanEval tab (`buildHumanEvalTab`), the run loop (`runHumanEvalProblems`/`runOneProblem`), the rate-limit retry prompter (`makeRetryPrompter`), and the Python-based scorer. The tab is composed into `/eval` by `cli/eval-menu.ts`; this file does not own the menu chrome or the `runRawPicker` loop. Dataset loading/download lives in `eval/humaneval-data.ts`; this file imports only the `HumanEvalProblem`/`HumanEvalResultMap` types from there. This is the HumanEval sibling of `cli/custom-eval-menu.ts` (the Custom tab).

**Read when:** Modifying the HumanEval tab or runner, changing how solutions are prompted or checked, or changing per-problem result tracking.

**Key neighbors:**
- `src/cli/eval-menu.ts` — composes this tab into `/eval`
- `src/cli/custom-eval-menu.ts` — the Custom-tab sibling (same `MenuTab` + run-loop shape)
- `src/eval/humaneval-data.ts` — dataset loading/download + `HumanEvalProblem`/`HumanEvalResultMap` types
- `src/cli/list-menu.ts` — `MenuTab` shape returned by `buildHumanEvalTab`
- `src/eval/runner.ts` — `startEvalScenario`, `resetEvalWorkDir`
- `src/cli/eval-screen.ts` — `printEvalHeader`, `printEvalSummary` (shared header/summary rendering)
- `src/cli/terminal-ui.ts` — `setActiveModelFromString`, `setTokenCount`
- `src/cli/eval-dots.ts` — `statusCircle` (colored dot renderer) reused for picker dots
- `src/providers/model-store.ts` — `appendEvalRun` (records each run to `.freecode/`)
- `evals/humaneval/.runs/` — per-problem work dirs (not tracked in git; gitignored under `evals/*`)
- `tests/scenarios/tty-humaneval-fake.scenario.json` — end-to-end fake-LLM TTY test; uses `tests/scenarios/humaneval-mini.jsonl.gz` as bundled single-problem dataset via `HUMANEVAL_DATA` env var

**Result persistence:** Each run is stored in `.freecode/models.json` (summary) and `.freecode/evals/humaneval/{provider}-{modelId}/{timestamp}.json` (full transcript + scoring). The `transcript` field is an array of turn objects, each with `systemPrompt`, `userMessage`, `tokenUsage: { input?, output? }`, and `toolCalls`. For humaneval (single-turn evals) the array always has exactly one entry.

**Update triggers:** Prompt wording changes, Python check logic, viewport size, run-dir layout, dot rendering, result persistence format, or the HumanEval tab/menu composition (see `cli/eval-menu.ts`).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildHumanEvalTab<R>(problems: HumanEvalProblem[], results: HumanEvalResultMap, choose: (problems: HumanEvalProblem[]) => R): MenuTab<R>

makeRetryPrompter(retryStatusFile: string, ask: (message: string) => Promise<boolean>, onDecline: () => void): () => void

printHumanEvalList(problems: HumanEvalProblem[]): void

runHumanEvalProblems(chosen: HumanEvalProblem[], model: string, rl: Interface): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `makeRetryPrompter` builds the rate-limit retry poll callback used by `runHumanEvalProblems` (installed on a 500ms `setInterval`). It owns the `promptingUser`/`lastSeenTargetMs` guard state and takes injectable `ask`/`onDecline` callbacks; exported so the poll branches can be unit-tested directly without driving the whole run loop.
- `printHumanEvalList` is exported but not called by production paths (non-TTY `/eval` lists only the Custom scenarios); it remains for potential future use or scripting.
