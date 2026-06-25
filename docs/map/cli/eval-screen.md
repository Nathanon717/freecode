# src/cli/eval-screen.ts - Eval Screen Renderers

**Role:** Renders the eval picker list, scenario detail view, and pass/fail report to the terminal.

## Exports

| Symbol | Description |
|--------|-------------|
| `printEvalHeader(id, prompt)` | Prints the header bar, "Prompt:", and prompt text to stdout before an eval run. Used by `/eval`. |
| `buildEvalPickerScreen(scenarios, selected, history, model, scenarioHashes, groups)` | Returns lines for the raw-mode picker: two blank header lines followed by one status-circle row per scenario. (The cyan title and grey controls hint were removed; controls are now pinned to the bottom row via `list-menu`'s `controls` field.) |
| `buildEvalDetailScreen(scenario, entry, model)` | Returns lines for the detail view: badge, assertion/warning/stat breakdown from the stored `EvalHistoryEntry`. |
| `printEvalReport(report)` | Prints a PASS/FAIL header, per-assertion icons, warnings, and stats to stdout after a run completes. |
| `printEvalSummary(passed, failed, incomplete)` | Prints the multi-run results summary line. Shared by the Custom and HumanEval run loops within `/eval` (called when more than one run executed). |

## Read When

- Changing the visual layout of the eval picker or detail pane.
- Modifying how grading results (assertions, warnings, stats) are formatted.
