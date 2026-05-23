# src/cli/scenario-menu.ts - Scenario Menus

**Role:** Presents `/test` and `/eval` scenario menus and runs selected scenarios.

## Exports

| Symbol | Description |
|--------|-------------|
| `printScriptedScenarioList(projectRoot)` | Non-interactive list of non-LLM verification scenarios for `--script` mode. |
| `runTestMenu(rl, projectRoot)` | Interactive single-select non-LLM verification menu. |
| `runEvalMenu(rl, projectRoot, getSelectedModel)` | Interactive eval menu backed by `playground/eval/` scenarios. |

## `/test`

- Filters summaries where `requiresLlm` is false.
- Allows one number/name choice.
- Runs the selected scenario without `--details`.
- Prints pass/fail based on harness exit status.

## `/eval`

- Discovers numbered scenario folders in `playground/eval/` (requires `prompt.md` + `eval/check.ts`).
- Allows picking one by number/id prefix, or `all` to run every scenario.
- Requires `y/yes` confirmation before running.
- Passes `FREECODE_MODEL` env var so the subprocess uses the currently selected model.
- Runs each scenario via `node --import tsx playground/eval/run.ts <id>` with `stdio: 'inherit'`.

## Terminal Integration

Both interactive menus temporarily tear down the bottom UI, resume readline, then restore the bottom UI when returning to chat.
