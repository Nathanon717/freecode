# Easy to Think About

This file tracks concrete efforts to make the codebase easier to understand, change, and verify.

When the user just pastes this file path, output in the chat a proposed idea, that should name the confusion, propose a cleaner boundary, and describe a useful next step.

After implementing a change, add it to the list.

## Change 1: `src/index.ts` is now a CLI coordinator

Split CLI responsibilities out of `src/index.ts`:

- `src/cli/terminal-ui.ts` owns bottom-pinned terminal rendering and input state.
- `src/cli/banner.ts` owns banner rendering and color persistence.
- `src/cli/slash-commands.ts` owns slash-command metadata, help, and autocomplete matching.
- `src/cli/scenario-menu.ts` owns `/test`, `/eval`, and scripted scenario listing.
- `src/cli/session-controller.ts` owns session id, message history, token count, and persistence calls.

## Change 2: Command execution now has a shared dispatcher

`src/cli/command-dispatcher.ts` now owns slash-command handling, session mutation, exit handling, and agent calls. Interactive and scripted loops only read input, echo or render mode-specific UI, and provide callbacks for config, scenario menus, provider listing, and tool confirmation.

## Change 3: Scenario expectations are split by assertion type

`tests/harness/assertions/` now owns one focused checker per scenario expectation type: stdout/stderr text, exit code, file content, and tool trace. `tests/harness/run-scenarios.ts` runs scenarios and delegates expectation evaluation to that boundary.

Unit tests cover the extracted checkers so new expectation types can be added without touching the whole harness.

## Change 4: Interactive and scripted input now share one session runner

`src/cli/session-runner.ts` owns the loop that reads input, dispatches commands, handles exit, and wires shared session/model state into `src/cli/command-dispatcher.ts`.

`src/cli/input-modes.ts` owns the mode-specific boundaries:

- Interactive mode reads terminal input with autocomplete, manages bottom UI restore points, opens `/config`, `/test`, and `/eval` menus, and asks for tool confirmations.
- Scripted mode reads the script file, echoes scripted turns, consumes scripted tool approvals, and prints non-interactive `/test` and `/eval` scenario lists.

`src/cli/scenario-catalog.ts` owns scenario discovery, selection parsing, and scenario execution. `src/cli/scenario-menu.ts` is now only menu rendering and prompts.

`src/index.ts` is now startup wiring: parse flags, create sessions, choose an input mode, and run the shared session runner.
