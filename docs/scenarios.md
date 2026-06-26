# Scenarios

Reference docs for verification and eval scenarios.

This table is generated from `tests/scenarios/*.scenario.json`. Run `npm run docs:generate` after adding, renaming, or reclassifying scenarios.

<!-- BEGIN GENERATED SCENARIOS -->
| File | Name | Type | Workspace | Description |
| --- | --- | --- | --- | --- |
| `agent-create-fake.scenario.json` | `agent-create-fake` | Non-LLM verification | temp | Fake LLM fixture drives an approved create tool call through the real agent loop |
| `agent-preamble-flush.scenario.json` | `agent-preamble-flush` | Non-LLM verification | temp | A pre-tool-call preamble with no trailing newline is flushed in its correct position (before the tool call) instead of being held in the markdown line buffer and glued onto the final step's text |
| `agent-text-fake.scenario.json` | `agent-text-fake` | Non-LLM verification | temp | Fake LLM fixture enters the agent loop and returns deterministic text without live provider access |
| `agent-text-native.scenario.json` | `agent-text-native` | Non-LLM verification | temp | Fake LLM fixture exercises the real AI SDK streamText path (native-stream) with a deterministic text response |
| `agent-tool-native.scenario.json` | `agent-tool-native` | Non-LLM verification | temp | Fake native LLM fixture drives a create tool call through the full multi-step streamText orchestration loop |
| `slash-clear.scenario.json` | `slash-clear` | Non-LLM verification | repo | /clear resets history, clears the screen, and redraws the banner |
| `slash-config-script-mode.scenario.json` | `slash-config-script-mode` | Non-LLM verification | repo | /config in script mode (no TTY) prints a message that the editor is only available in interactive mode |
| `slash-keys.scenario.json` | `slash-status` | Non-LLM verification | repo | /status command shows API keys, DB, and Doppler info without crashing |
| `slash-model-list.scenario.json` | `slash-model-list` | Non-LLM verification | repo | /models aliases /model with no arg and prints current model without crashing |
| `slash-stray-confirmation.scenario.json` | `slash-stray-confirmation` | Non-LLM verification | repo | Sending 'y' with no pending tool call is silently skipped rather than forwarded to the agent |
| `startup-help-exit.scenario.json` | `startup-help-exit` | Non-LLM verification | repo | Boot the CLI, print help, exit cleanly |
| `tty-all-commands-shown.scenario.json` | `tty-all-commands-shown` | Non-LLM verification | repo | Typing / shows all slash commands in the suggestion list |
| `tty-autocomplete.scenario.json` | `tty-autocomplete` | Non-LLM verification | repo | Interactive TUI: slash command suggestions, prefix filtering, tab completion, and submit reset, verified against the rendered screen |
| `tty-backspace.scenario.json` | `tty-backspace` | Non-LLM verification | repo | Backspace key removes the last character from the input buffer; repeated backspaces restore the empty-prompt hint |
| `tty-clear-redraws.scenario.json` | `tty-clear-redraws` | Non-LLM verification | repo | Submitting /clear clears the whole terminal, redraws the banner, and the cleared message appears in the raw stream |
| `tty-config-editor.scenario.json` | `tty-config-editor` | Non-LLM verification | repo | Submitting /config opens the interactive settings editor showing all settings; pressing q closes it and restores the input prompt |
| `tty-config-esc.scenario.json` | `tty-config-esc` | Non-LLM verification | repo | Submitting /config opens the standalone config editor; pressing Esc closes it, erases its screen, and restores the input prompt |
| `tty-config-load-agents-md.scenario.json` | `tty-config-load-agents-md` | Non-LLM verification | repo | Load AGENTS.md setting appears in Provider and Model tabs but not in the Global tab |
| `tty-config-parsed-tools.scenario.json` | `tty-config-parsed-tools` | Non-LLM verification | repo | Parsed tools setting appears only on the Model tab (absent from Global and Provider tabs) |
| `tty-config-toggle.scenario.json` | `tty-config-toggle` | Non-LLM verification | repo | Space key toggles a boolean setting in the config editor; the changed value persists and the editor can be reopened without error |
| `tty-escape-clears.scenario.json` | `tty-escape-clears` | Non-LLM verification | repo | Escape key clears the input buffer and hides the suggestion list, restoring the empty-prompt hint |
| `tty-eval-menu.scenario.json` | `tty-eval-menu` | Non-LLM verification | repo | Submitting /eval opens the standalone eval picker showing available scenarios; pressing Esc closes it and restores the input prompt |
| `tty-eval-then-config-picker.scenario.json` | `tty-eval-then-config-picker` | Non-LLM verification | repo | After a fake eval completes, another raw picker can still receive input and Ctrl-C exits cleanly |
| `tty-footer-toggles.scenario.json` | `tty-footer-toggles` | Non-LLM verification | repo | Footer toggle bar shows A and R toggles at startup with ctrl+ prefix; Ctrl+A and Ctrl+R cycle the toggles without corrupting the input area |
| `tty-fuzzy-completion.scenario.json` | `tty-fuzzy-completion` | Non-LLM verification | repo | Fuzzy query /ss matches /status; Tab expands the buffer to /status, Enter submits and shows the status output |
| `tty-help-output.scenario.json` | `tty-help-output` | Non-LLM verification | repo | Submitting /help renders the command list in the scroll region while the input prompt remains pinned at the bottom; slash suggestion overlay opens and restores cleanly over the output |
| `tty-humaneval-fake.scenario.json` | `tty-humaneval-fake` | Non-LLM verification | repo | Fake LLM completes HumanEval/0 — verifies data-load, agent, Python-check pipeline end-to-end |
| `tty-inline-completion.scenario.json` | `tty-inline-completion` | Non-LLM verification | repo | A partial prefix renders the full command inline before Tab is pressed; inline completion updates as the buffer changes |
| `tty-model-inline.scenario.json` | `tty-model-inline` | Non-LLM verification | repo | /model <arg> sets the model inline without opening the picker and prints the confirmation in the scroll region |
| `tty-model-picker-no-arg.scenario.json` | `tty-model-picker-no-arg` | Non-LLM verification | repo | /model with no argument opens the interactive picker (zen free models available by default); ESC closes it and returns the prompt |
| `tty-prefix-multi-match.scenario.json` | `tty-prefix-multi-match` | Non-LLM verification | repo | Typing /c shows /clear as the inline completion and /config as a suggestion; unrelated commands are absent |
| `tty-slash-backspace-restore.scenario.json` | `tty-slash-backspace-restore` | Non-LLM verification | repo | After /help output fills the scroll region, typing / shows the suggestion overlay; backspace restores the help output exactly. The cycle repeats correctly a second time. |
| `tty-status-line.scenario.json` | `tty-status-line` | Non-LLM verification | repo | Status line shows context token count at the bottom of the terminal at idle |
<!-- END GENERATED SCENARIOS -->
