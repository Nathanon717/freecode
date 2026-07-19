# src/cli/eval/humaneval-menu.ts - HumanEval Tab + Run Loop

**Role:** Implements the HumanEval tab (`buildHumanEvalTab`), the run loop (`runHumanEvalProblems`/`runOneProblem`), the rate-limit retry prompter (`makeRetryPrompter`), and the Python-based scorer. Composed into `/eval` by `cli/eval/eval-menu.ts` (this file doesn't own the menu chrome or the `runRawPicker` loop). Dataset loading/download lives in `eval/humaneval-data.ts`; this file only imports its `HumanEvalProblem`/`HumanEvalResultMap` types. Sibling of `cli/eval/custom-eval-menu.ts` (the Custom tab).

**Key neighbors:**
- `src/cli/eval/eval-menu.ts` — composes this tab into `/eval`
- `src/cli/eval/custom-eval-menu.ts` — the Custom-tab sibling (same `MenuTab` + run-loop shape)
- `src/eval/humaneval-data.ts` — dataset loading/download + `HumanEvalProblem`/`HumanEvalResultMap` types
- `src/cli/menus/list-menu.ts` — `MenuTab` shape returned by `buildHumanEvalTab`
- `src/eval/runner.ts` — `startEvalScenario`, `resetEvalWorkDir`
- `src/cli/eval/eval-screen.ts` — `printEvalHeader`, `printEvalSummary` (shared header/summary rendering)
- `src/cli/chrome/footer-status.ts` — `setActiveModelFromString`
- `src/cli/eval/eval-dots.ts` — `statusCircle` (colored dot renderer) reused for picker dots
- `src/providers/model-data.ts` — `appendEvalRun` (records each run to `.freecode/`)
- `evals/humaneval/.runs/` — per-problem work dirs (not tracked in git; gitignored under `evals/*`)
- `tests/scenarios/tty-humaneval-fake.scenario.json` — end-to-end fake-LLM TTY test; uses `tests/scenarios/humaneval-mini.jsonl.gz` as bundled single-problem dataset via `HUMANEVAL_DATA` env var

**Result persistence:** Each run is stored in `.freecode/models.json` (summary) and `.freecode/evals/humaneval/{provider}-{modelId}/{timestamp}.json` (full transcript + scoring). The `transcript` field is an array of turn objects, each with `systemPrompt`, `userMessage`, `tokenUsage: { input?, output? }`, and `toolCalls`. For humaneval (single-turn evals) the array always has exactly one entry.

**Read when:** Changing prompt wording, the Python check logic, viewport size, run-dir layout, dot rendering, result persistence format, or the tab/menu composition (see `cli/eval/eval-menu.ts`).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildHumanEvalTab<R>(problems: HumanEvalProblem[], results: HumanEvalResultMap, choose: (problems: HumanEvalProblem[]) => R): MenuTab<R>

makeRetryPrompter(retryStatusFile: string, ask: (message: string) => Promise<boolean>, onDecline: () => void): () => void

runHumanEvalProblems(chosen: HumanEvalProblem[], model: string, rl: Interface): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `makeRetryPrompter` builds the rate-limit retry poll callback used by `runHumanEvalProblems` (installed on a 500ms `setInterval`). It owns the `promptingUser`/`lastSeenTargetMs` guard state and takes injectable `ask`/`onDecline` callbacks; exported so the poll branches can be unit-tested directly without driving the whole run loop.
