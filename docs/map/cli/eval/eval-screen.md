# src/cli/eval/eval-screen.ts - Eval Screen Renderers

**Role:** Renders the eval picker list, scenario detail view, and pass/fail report to the terminal.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
printEvalHeader(id: string, prompt: string): void

printEvalReport(report: EvalReport): void

printEvalSummary(passed: number, failed: number, incomplete: number): void

buildEvalPickerScreen(scenarios: CustomEval[], selected: number, history: EvalHistoryEntry[], model: string, scenarioHashes: Map<string, ScenarioHashes>): string[]

buildEvalDetailScreen(scenario: CustomEval, entry: EvalHistoryEntry | null, model: string): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`eval/history.ts`](../../eval/history.md) ×9, [`cli/render/banner.ts`](../render/banner.md) ×4, [`cli/theme.ts`](../theme.md) ×4, [`eval/custom.ts`](../../eval/custom.md) ×2, [`cli/eval/eval-dots.ts`](eval-dots.md) ×1, [`eval/runner.ts`](../../eval/runner.md) ×1
- **Imported by:** [`cli/eval/custom-eval-menu.ts`](custom-eval-menu.md) ×5, [`cli/eval/humaneval-menu.ts`](humaneval-menu.md) ×2

## Tests

`tests/cli/eval/eval-screen.test.ts`. 2 other test files reference it.

## Budget

165 / 500 lines (335 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `printEvalHeader` — prints the labeled `── id ──` bar, "Prompt:", the prompt text, and a single-line prompt→response separator (matching `transcript-renderer.ts` `writeStepSeparator`) to stdout before an eval run; used by `/eval`.
- `buildEvalPickerScreen` — controls hint is pinned to the bottom row via `list-menu`'s `controls` field (not rendered inline).
- `printEvalSummary` — shared by the Custom and HumanEval run loops within `/eval`; called when more than one run executed.

## Read When

- Changing the visual layout of the eval picker or detail pane.
- Modifying how grading results (assertions, warnings, stats) are formatted.
