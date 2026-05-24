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
- Opens a raw-mode standalone picker (Up/Down navigate, Enter run one, `a` run all, Esc close); the picker erases its rendered rows on close like the `/model` and `/config` pages.
- Requires `y/yes` confirmation before running.
- Resets each scenario's `work/` dir from `start/`, stores harness artifacts in sibling `.run/`, then spawns the compiled freecode agent via `--script` mode with `cwd = work/`.
- Sets `FREECODE_TRANSCRIPT_STREAM=stdout` so the captured eval run replays the same transcript formatter used by normal tool logging.
- Summarizes structured model API errors after the captured transcript, including provider `code`, `type`, `param`, `failed_generation`, and a `tool_use_failed` diagnosis when the provider omits the referenced failed generation payload.
- Dynamically imports each scenario's `eval/check.ts` to score the result and print a pass/fail report.
- Passes the currently selected model via `FREECODE_MODEL` env var to the agent subprocess.

## Terminal Integration

Both interactive menus temporarily tear down the bottom UI, resume readline, then restore the bottom UI when returning to chat.
