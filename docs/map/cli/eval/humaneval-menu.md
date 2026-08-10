# src/cli/eval/humaneval-menu.ts - HumanEval Tab + Run Loop

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Implements the HumanEval tab (`buildHumanEvalTab`), the run loop (`runHumanEvalProblems`/`runOneProblem`), the rate-limit retry prompter (`makeRetryPrompter`), and the Python-based scorer. Composed into `/eval` by `cli/eval/eval-menu.ts`, which owns the menu chrome and the `runRawPicker` loop.

## Read When

Changing prompt wording, the Python check logic, viewport size, run-dir layout, dot rendering, result persistence format, or the tab/menu composition (see `cli/eval/eval-menu.ts`).
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildHumanEvalTab<R>(problems: HumanEvalProblem[], results: HumanEvalResultMap, choose: (problems: HumanEvalProblem[]) => R): MenuTab<R>

/**
 * Build the poll callback that watches `retryStatusFile` for rate-limit events;
 * `runHumanEvalProblems` installs it on a 500ms `setInterval`.
 *
 * On each tick, when a *new* event appears (a targetMs not seen before) it asks
 * the user whether to continue, calling `onDecline` if they decline. Re-prompts
 * are suppressed while a prompt is open and for any targetMs already handled;
 * read errors are swallowed. The guard state (`promptingUser`,
 * `lastSeenTargetMs`) lives in the returned closure, so the caller just installs
 * it on a timer. Exported with injectable `ask`/`onDecline` so the poll branches
 * are unit-testable without driving the whole run loop.
 */
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

319 / 500 lines (181 to spare).
<!-- END GENERATED MAP FACTS -->

## Result Persistence

Each run is stored in `.freecode/models.json` (summary) and `.freecode/evals/humaneval/{provider}-{modelId}/{timestamp}.json` (full transcript + scoring). The `transcript` field is an array of turn objects, each with `systemPrompt`, `userMessage`, `tokenUsage: { input?, output? }`, and `toolCalls`. For humaneval (single-turn evals) the array always has exactly one entry.

## Notes

`tests/e2e/tty-humaneval-fake.e2e.json` is the end-to-end fake-LLM TTY test for this tab.
It points `HUMANEVAL_DATA` at `tests/e2e/humaneval-mini.jsonl.gz`, a bundled single-problem
dataset.

Dataset loading and download live in
[../../eval/humaneval-data.md](../../eval/humaneval-data.md); this file imports only its
`HumanEvalProblem` / `HumanEvalResultMap` types. Sibling of
[custom-eval-menu.md](custom-eval-menu.md), the Custom tab.
