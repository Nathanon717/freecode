# src/cli/eval-screen.ts - Eval Screen Renderers

**Role:** Renders the eval picker list, scenario detail view, and pass/fail report to the terminal.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
printEvalHeader(id: string, prompt: string): void

printEvalReport(report: EvalReport): void

printEvalSummary(passed: number, failed: number, incomplete: number): void

buildEvalPickerScreen(scenarios: PlaygroundScenario[], selected: number, history: EvalHistoryEntry[], model: string, scenarioHashes: Map<string, ScenarioHashes>): string[]

buildEvalDetailScreen(scenario: PlaygroundScenario, entry: EvalHistoryEntry | null, model: string): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `printEvalHeader` — prints the header bar, "Prompt:", and prompt text to stdout before an eval run; used by `/eval`.
- `buildEvalPickerScreen` — controls hint is pinned to the bottom row via `list-menu`'s `controls` field (not rendered inline).
- `printEvalSummary` — shared by the Custom and HumanEval run loops within `/eval`; called when more than one run executed.

## Read When

- Changing the visual layout of the eval picker or detail pane.
- Modifying how grading results (assertions, warnings, stats) are formatted.
