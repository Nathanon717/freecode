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
- `tests/e2e/tty-humaneval-fake.e2e.json` — end-to-end fake-LLM TTY test; uses `tests/e2e/humaneval-mini.jsonl.gz` as bundled single-problem dataset via `HUMANEVAL_DATA` env var

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

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`eval/humaneval-data.ts`](../../eval/humaneval-data.md) ×10, [`providers/model-data.ts`](../../providers/model-data.md) ×5, [`cli/menus/list-menu.ts`](../menus/list-menu.md) ×3, [`cli/render/banner.ts`](../render/banner.md) ×3, [`cli/eval/eval-screen.ts`](eval-screen.md) ×2, [`eval/runner.ts`](../../eval/runner.md) ×2, [`agent/system-prompt.ts`](../../agent/system-prompt.md) ×1, [`cli/chrome/footer-status.ts`](../chrome/footer-status.md) ×1, [`cli/eval/eval-dots.ts`](eval-dots.md) ×1, [`cli/menus/action-menu.ts`](../menus/action-menu.md) ×1
- **Imported by:** [`cli/eval/eval-menu.ts`](eval-menu.md) ×2

## Tests

`tests/cli/eval/humaneval-menu.test.ts`. 1 other test file references it.

## Budget

313 / 500 lines (187 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `makeRetryPrompter` builds the rate-limit retry poll callback used by `runHumanEvalProblems` (installed on a 500ms `setInterval`). It owns the `promptingUser`/`lastSeenTargetMs` guard state and takes injectable `ask`/`onDecline` callbacks; exported so the poll branches can be unit-tested directly without driving the whole run loop.
