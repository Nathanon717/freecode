# E2e Tests

Reference docs for e2e tests.

This table is generated from `tests/e2e/*.e2e.json`.

<!-- BEGIN GENERATED E2E -->
| File | Name | Workspace | Description |
| --- | --- | --- | --- |
| `agent-create-fake.e2e.json` | `agent-create-fake` | temp | Fake LLM fixture drives an approved create tool call through the real agent loop |
| `agent-history-tool-turns-native.e2e.json` | `agent-history-tool-turns-native` | temp | Native path: the SDK's real tool-call and role:'tool' result messages survive into the next user turn, so a second turn is sent the work itself. The fake path covers the same in agent-history-tool-turns; this one exercises the shapes a real provider would 400 on if they were persisted unpaired |
| `agent-history-tool-turns.e2e.json` | `agent-history-tool-turns` | temp | A turn's tool call and tool result stay in the conversation history, so a second user turn is sent the work itself rather than only the assistant's summary of it |
| `agent-preamble-flush.e2e.json` | `agent-preamble-flush` | temp | A pre-tool-call preamble with no trailing newline is flushed in its correct position (before the tool call) instead of being held in the markdown line buffer and glued onto the final step's text |
| `agent-text-fake.e2e.json` | `agent-text-fake` | temp | Fake LLM fixture enters the agent loop and returns deterministic text without live provider access |
| `agent-text-native.e2e.json` | `agent-text-native` | temp | Fake LLM fixture exercises the real AI SDK streamText path (native-stream) with a deterministic text response |
| `agent-tool-arg-error-native.e2e.json` | `agent-tool-arg-error-native` | temp | Tool calls the SDK rejects before execution (unknown name, then bad arguments) are reported back to the model as failed steps; the turn continues from what already ran and the model retries with a valid call |
| `agent-tool-native.e2e.json` | `agent-tool-native` | temp | Fake native LLM fixture drives a create tool call through the full multi-step streamText orchestration loop |
| `agent-turn-failure-no-orphan.e2e.json` | `agent-turn-failure-no-orphan` | temp | A turn that fails at the provider leaves history exactly as it was: the next turn is sent only its own user message, with no orphaned request the model never answered and no error report persisted as something the assistant said |
| `blocklist-purge-script-mode.e2e.json` | `blocklist-purge-script-mode` | repo | A scripted (non-TTY) run never offers the blocklist purge and never deletes the seeded blocklisted model — the confirmation is unanswerable without a terminal, so the rows must be left alone |
| `slash-clear.e2e.json` | `slash-clear` | repo | /clear resets history, clears the screen, and redraws the banner |
| `slash-config-script-mode.e2e.json` | `slash-config-script-mode` | repo | /config in script mode (no TTY) prints a message that the editor is only available in interactive mode |
| `slash-keys.e2e.json` | `slash-status` | repo | /status command shows API keys, DB, and Doppler info without crashing |
| `slash-model-list.e2e.json` | `slash-model-list` | repo | /models aliases /model with no arg and prints current model without crashing |
| `slash-stray-confirmation.e2e.json` | `slash-stray-confirmation` | repo | Sending 'y' with no pending tool call is silently skipped rather than forwarded to the agent |
| `spawn-agent-fake.e2e.json` | `spawn-agent-fake` | temp | The main agent delegates a read-only investigation to the explore sub-agent via spawn_agent. The sub-agent runs its own turn loop (list_dir then a findings report) through the SAME fake fixture queue and returns a compact result the parent relays. From the parent's tool trace only one call (spawn_agent) is visible — the sub-agent's read-only tool calls are invisible, which is the context-minimisation win. |
| `spawn-agent-native.e2e.json` | `spawn-agent-native` | temp | The production sub-agent path: a mock-native parent runs through the real streamText orchestration loop, calls spawn_agent, and the explore sub-agent runs its own streamText turn loop (list_dir then a findings report) — draining fullStream silently and returning only the final report. Proves runNativeSubAgent nests through the same shared fixture queue as the parent, with only spawn_agent visible in the parent's tool trace. |
| `startup-help-exit.e2e.json` | `startup-help-exit` | repo | Boot the CLI, print help, exit cleanly |
| `tool-invoke-list-dir.e2e.json` | `tool-invoke-list-dir` | repo | Typing list_dir(path=.) invokes the tool directly through the real wrapped executor instead of sending the text to the agent |
| `tools-list.e2e.json` | `tools-list` | repo | /tools lists every callable tool with its signature and description |
| `tty-abort-no-orphan.e2e.json` | `tty-abort-no-orphan` | repo | Escaping a tool approval aborts the turn before the model said anything, and that turn leaves no trace in history: the next turn is sent only its own message instead of following an orphaned request the model never answered |
| `tty-all-commands-shown.e2e.json` | `tty-all-commands-shown` | repo | Typing / shows all slash commands in the suggestion list |
| `tty-autocomplete.e2e.json` | `tty-autocomplete` | repo | Interactive TUI: slash command suggestions, prefix filtering, tab completion, and submit reset, verified against the rendered screen |
| `tty-backspace.e2e.json` | `tty-backspace` | repo | Backspace key removes the last character from the input buffer; repeated backspaces restore the empty-prompt hint |
| `tty-banner-not-scrolled.e2e.json` | `tty-banner-not-scrolled` | repo | The startup banner stays where it painted when the footer and input UI draw after it — both compact-banner borders are still on screen |
| `tty-blocklist-purge.e2e.json` | `tty-blocklist-purge` | repo | A stored model whose id is on a registry blocklist triggers a startup confirmation naming it; Enter deletes it and models that are not blocklisted are left alone |
| `tty-clear-redraws.e2e.json` | `tty-clear-redraws` | repo | Submitting /clear clears the whole terminal, redraws the banner, and the cleared message appears in the raw stream |
| `tty-config-editor.e2e.json` | `tty-config-editor` | repo | Submitting /config opens the interactive settings editor showing all settings; pressing q closes it and restores the input prompt |
| `tty-config-esc.e2e.json` | `tty-config-esc` | repo | Submitting /config opens the standalone config editor; pressing Esc closes it, erases its screen, and restores the input prompt |
| `tty-config-keeps-transcript.e2e.json` | `tty-config-keeps-transcript` | repo | Leaving /config wipes the screen but not the conversation, so the transcript is reprinted as it was rather than left looking like a fresh session. The replay comes from the render record, so the tool call line and its result preview come back too, not just the text. /clear, which really does empty the history, still lands on a bare banner. /model and /eval share the same dispatcher call site but cannot be driven here - the model picker refuses to open under FREECODE_FAKE_LLM=1 |
| `tty-config-load-agents-md.e2e.json` | `tty-config-load-agents-md` | repo | Load AGENTS.md setting appears in Provider and Model tabs but not in the Global tab |
| `tty-config-parsed-tools.e2e.json` | `tty-config-parsed-tools` | repo | Parsed tools setting appears only on the Model tab (absent from Global and Provider tabs) |
| `tty-config-toggle.e2e.json` | `tty-config-toggle` | repo | Space key toggles a boolean setting in the config editor; the changed value persists and the editor can be reopened without error |
| `tty-escape-clears.e2e.json` | `tty-escape-clears` | repo | Escape key clears the input buffer and hides the suggestion list, restoring the empty-prompt hint |
| `tty-eval-menu.e2e.json` | `tty-eval-menu` | repo | Submitting /eval opens the standalone eval picker showing available scenarios; pressing Esc closes it and restores the input prompt |
| `tty-eval-then-config-picker.e2e.json` | `tty-eval-then-config-picker` | repo | After a fake eval completes, another raw picker can still receive input and Ctrl-C exits cleanly |
| `tty-footer-toggles.e2e.json` | `tty-footer-toggles` | repo | Footer toggle bar shows S, A and R toggles at startup with ctrl+ prefix; Ctrl+S shows and hides the toggle names; Ctrl+A and Ctrl+R cycle the toggles without corrupting the input area |
| `tty-fuzzy-completion.e2e.json` | `tty-fuzzy-completion` | repo | Fuzzy query /ss matches /status; Tab expands the buffer to /status, Enter submits and shows the status output |
| `tty-help-output.e2e.json` | `tty-help-output` | repo | Submitting /help renders the command list in the scroll region while the input prompt remains pinned at the bottom; slash suggestion overlay opens and restores cleanly over the output |
| `tty-humaneval-fake.e2e.json` | `tty-humaneval-fake` | repo | Fake LLM completes HumanEval/0 — verifies data-load, agent, Python-check pipeline end-to-end |
| `tty-inline-completion.e2e.json` | `tty-inline-completion` | repo | A partial prefix renders the full command inline before Tab is pressed; inline completion updates as the buffer changes |
| `tty-model-inline.e2e.json` | `tty-model-inline` | repo | /model <arg> sets the model inline without opening the picker and prints the confirmation in the scroll region |
| `tty-model-picker-no-arg.e2e.json` | `tty-model-picker-no-arg` | repo | /model with no argument opens the interactive picker (zen free models available by default); ESC closes it and returns the prompt |
| `tty-prefix-multi-match.e2e.json` | `tty-prefix-multi-match` | repo | Typing /c shows /clear as the inline completion and /config as a suggestion; unrelated commands are absent |
| `tty-resize-banner-narrow.e2e.json` | `tty-resize-banner-narrow` | repo | On a fresh screen, narrowing below the 82-col boundary redraws the full banner as the compact banner responsively; no leftover full-banner cells and the prompt stays intact |
| `tty-resize-banner-widen.e2e.json` | `tty-resize-banner-widen` | repo | On a fresh screen (banner only, no transcript), widening past the 82-col boundary redraws the compact banner as the full banner responsively; the prompt stays intact |
| `tty-resize-eval-menu.e2e.json` | `tty-resize-eval-menu` | repo | A pinned full-screen menu (the /eval picker) repaints itself at the new width on resize via the onResize callback, so the menu chrome and rows stay intact rather than resetting to the banner |
| `tty-resize-overlay.e2e.json` | `tty-resize-overlay` | repo | Resizing while the slash-command suggestion overlay is open reflows cleanly: the overlay is invalidated and repainted at the new width, the input prompt stays intact, and stale overlay rows are not left in the transcript |
| `tty-resize-preserves-input.e2e.json` | `tty-resize-preserves-input` | repo | Typed-but-unsubmitted input survives a resize: the input buffer is redrawn from state at the new width across both a widen and a narrow, so the text is never lost |
| `tty-resize-preserves-transcript.e2e.json` | `tty-resize-preserves-transcript` | repo | Regression: once a transcript has printed, resizing reflows it in place and never wipes it back to the banner, and leaves exactly one input frame (no stale ghost copy of the prompt from the pre-resize width). Prints /help output, then resizes and asserts the transcript survives, no banner is redrawn over it, and the prompt appears exactly once |
| `tty-slash-backspace-restore.e2e.json` | `tty-slash-backspace-restore` | repo | After /help output fills the scroll region, typing / shows the suggestion overlay; backspace restores the help output exactly. The cycle repeats correctly a second time. |
| `tty-status-line-ticks.e2e.json` | `tty-status-line-ticks` | repo | The footer ctx count ticks up mid-turn: step 1's prompt tokens are on screen while its tool is still running, then the count rises to step 2's larger history when the turn ends. The fixture's tool sleeps via `node -e`, not `sleep` — cmd.exe has no `sleep`, so on Windows the tool returned instantly and the mid-turn window never existed |
| `tty-status-line.e2e.json` | `tty-status-line` | repo | After a turn, the footer status line shows the provider-reported context token count (the last call's prompt tokens), pinned to the exact number the fixture reported |
| `tty-tool-approval-preview-edit.e2e.json` | `tty-tool-approval-preview-edit` | repo | Interactive tool approval UI shows the pending edit's diff (removed/added lines under a gutter) before the user confirms, just like create |
| `tty-tool-approval-preview-fits.e2e.json` | `tty-tool-approval-preview-fits` | repo | A pending-approval preview too long for the terminal is trimmed from the bottom, so the model's preamble and the tool call line it is approving stay on screen |
| `tty-tool-approval-preview.e2e.json` | `tty-tool-approval-preview` | repo | Interactive tool approval UI shows a dim, indented content preview for list_dir plus the token count approving would add, before the user confirms |
| `tty-tool-autobracket.e2e.json` | `tty-tool-autobracket` | repo | Typing ( after a valid tool name autofills the full argument skeleton with quotes; typing ) at the closing paren types over it; a non-tool name does not autofill |
| `tty-tool-tabstops.e2e.json` | `tty-tool-tabstops` | repo | Tab cycles forward through autofilled tool-call value slots; Backspace at an emptied slot steps back to the previous slot instead of eating the skeleton |
<!-- END GENERATED E2E -->
