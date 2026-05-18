# src/cli/scenario-menu.ts - Scenario Menus

**Role:** Presents `/test` and `/eval` scenario menus and runs selected scenarios.

## Exports

| Symbol | Description |
|--------|-------------|
| `printScriptedScenarioList(projectRoot, requiresLlm)` | Non-interactive list rendering for `--script` mode. |
| `runTestMenu(rl, projectRoot)` | Interactive single-select non-LLM verification menu. |
| `runEvalMenu(rl, projectRoot)` | Interactive multi-select LLM eval menu with explicit confirmation. |

## `/test`

- Filters summaries where `requiresLlm` is false.
- Allows one number/name choice.
- Runs the selected scenario without `--details`.
- Prints pass/fail based on harness exit status.

## `/eval`

- Filters summaries where `requiresLlm` is true.
- Supports multiple names/numbers and ranges through `parseScenarioSelection()`.
- Requires `y/yes` confirmation before running real LLM evals.
- Runs each selected scenario with `--details`.

## Terminal Integration

Both interactive menus temporarily tear down the bottom UI, resume readline, then restore the bottom UI when returning to chat.
