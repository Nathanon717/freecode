# Scenarios

Reference docs for verification and eval scenarios.

This table is generated from `tests/scenarios/*.scenario.json`. Run `npm run docs:generate` after adding, renaming, or reclassifying scenarios.

<!-- BEGIN GENERATED SCENARIOS -->
| File | Name | Type | Workspace | Description |
| --- | --- | --- | --- | --- |
| `agent-text-fake.scenario.json` | `agent-text-fake` | Non-LLM verification | temp | Fake LLM fixture enters the agent loop and returns deterministic text without live provider access |
| `agent-text-native.scenario.json` | `agent-text-native` | Non-LLM verification | temp | Fake LLM fixture exercises the real AI SDK streamText path (native-stream) with a deterministic text response |
| `agent-tool-native.scenario.json` | `agent-tool-native` | Non-LLM verification | temp | Fake native LLM fixture drives a write_file tool call through the full multi-step streamText orchestration loop |
| `agent-write-file-fake.scenario.json` | `agent-write-file-fake` | Non-LLM verification | temp | Fake LLM fixture drives an approved write_file tool call through the real agent loop |
| `slash-clear.scenario.json` | `slash-clear` | Non-LLM verification | repo | /clear resets history, clears the screen, and redraws the banner |
| `slash-config-script-mode.scenario.json` | `slash-config-script-mode` | Non-LLM verification | repo | /config in script mode (no TTY) prints a message that the editor is only available in interactive mode |
| `slash-keys.scenario.json` | `slash-keys` | Non-LLM verification | repo | /keys command lists providers without crashing |
| `slash-model-list.scenario.json` | `slash-model-list` | Non-LLM verification | repo | /models aliases /model with no arg and prints current model without crashing |
| `slash-sources.scenario.json` | `slash-sources` | Non-LLM verification | repo | /sources command lists model data sources without crashing |
| `slash-stray-confirmation.scenario.json` | `slash-stray-confirmation` | Non-LLM verification | repo | Sending 'y' with no pending tool call is silently skipped rather than forwarded to the agent |
| `slash-test-menu.scenario.json` | `slash-test-menu` | Non-LLM verification | repo | /test lists scenario tests without running one in script mode |
| `startup-help-exit.scenario.json` | `startup-help-exit` | Non-LLM verification | repo | Boot the CLI, print help, exit cleanly |
| `tty-all-commands-shown.scenario.json` | `tty-all-commands-shown` | Non-LLM verification | repo | Typing / shows all nine slash commands in the suggestion list |
| `tty-autocomplete.scenario.json` | `tty-autocomplete` | Non-LLM verification | repo | Interactive TUI: slash command suggestions, prefix filtering, tab completion, and submit reset, verified against the rendered screen |
| `tty-backspace.scenario.json` | `tty-backspace` | Non-LLM verification | repo | Backspace key removes the last character from the input buffer; repeated backspaces restore the empty-prompt hint |
| `tty-clear-redraws.scenario.json` | `tty-clear-redraws` | Non-LLM verification | repo | Submitting /clear clears the whole terminal, redraws the banner, and the cleared message appears in the raw stream |
| `tty-config-editor.scenario.json` | `tty-config-editor` | Non-LLM verification | repo | Submitting /config opens the interactive settings editor showing all settings; pressing q closes it and restores the input prompt |
| `tty-config-esc.scenario.json` | `tty-config-esc` | Non-LLM verification | repo | Submitting /config opens the standalone config editor; pressing Esc closes it, erases its screen, and restores the input prompt |
| `tty-config-toggle.scenario.json` | `tty-config-toggle` | Non-LLM verification | repo | Space key toggles a boolean setting in the config editor; the changed value persists and the editor can be reopened without error |
| `tty-escape-clears.scenario.json` | `tty-escape-clears` | Non-LLM verification | repo | Escape key clears the input buffer and hides the suggestion list, restoring the empty-prompt hint |
| `tty-eval-menu.scenario.json` | `tty-eval-menu` | Non-LLM verification | repo | Submitting /eval opens the standalone eval picker showing available scenarios; pressing Esc closes it and restores the input prompt |
| `tty-fuzzy-completion.scenario.json` | `tty-fuzzy-completion` | Non-LLM verification | repo | Fuzzy query /ks matches /keys; Tab expands the buffer to /keys, Enter submits and shows the key status |
| `tty-help-output.scenario.json` | `tty-help-output` | Non-LLM verification | repo | Submitting /help renders the command list in the scroll region while the input prompt remains pinned at the bottom |
| `tty-inline-completion.scenario.json` | `tty-inline-completion` | Non-LLM verification | repo | A partial prefix renders the full command inline before Tab is pressed; inline completion updates as the buffer changes |
| `tty-model-inline.scenario.json` | `tty-model-inline` | Non-LLM verification | repo | /model <arg> sets the model inline without opening the picker and prints the confirmation in the scroll region |
| `tty-model-picker-no-arg.scenario.json` | `tty-model-picker-no-arg` | Non-LLM verification | repo | /model with no argument invokes the interactive picker flow; loading message appears and ESC or the no-providers fallback returns the prompt |
| `tty-prefix-multi-match.scenario.json` | `tty-prefix-multi-match` | Non-LLM verification | repo | Typing /c shows /clear as the inline completion and /config + /sources as suggestions (sources contains letter c); unrelated commands are absent |
| `tty-resume-command.scenario.json` | `tty-resume-command` | Non-LLM verification | repo | /resume finds the session created at startup and reports messages loaded, then restores the prompt |
| `tty-status-line.scenario.json` | `tty-status-line` | Non-LLM verification | repo | Status line shows context token count at the bottom of the terminal at idle |
<!-- END GENERATED SCENARIOS -->
