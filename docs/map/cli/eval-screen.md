# src/cli/eval-screen.ts - Eval Screen Renderers

**Role:** Renders the eval picker list, scenario detail view, and pass/fail report to the terminal.

## Exports

| Symbol | Description |
|--------|-------------|
| `buildEvalPickerScreen(scenarios, selected, history, model, scenarioHashes, groups)` | Returns lines for the raw-mode picker: header, keybinding hint, and one status-circle row per scenario. |
| `buildEvalDetailScreen(scenario, entry, model)` | Returns lines for the detail view: badge, assertion/warning/stat breakdown from the stored `EvalHistoryEntry`. |
| `printEvalReport(report)` | Prints a PASS/FAIL header, per-assertion icons, warnings, and stats to stdout after a run completes. |

## Read When

- Changing the visual layout of the eval picker or detail pane.
- Modifying how grading results (assertions, warnings, stats) are formatted.
