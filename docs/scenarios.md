# Scenarios

Reference docs for verification and eval scenarios.

This table is generated from `tests/scenarios/*.scenario.json`. Run `npm run docs:generate` after adding, renaming, or reclassifying scenarios.

<!-- BEGIN GENERATED SCENARIOS -->
| File | Name | Type | Workspace | Description |
| --- | --- | --- | --- | --- |
| `01-eval-basic-read-search.scenario.json` | `01-eval-basic-read-search` | LLM eval | repo | Easy: list, read package metadata, grep for the help command implementation |
| `02-eval-medium-create-files.scenario.json` | `02-eval-medium-create-files` | LLM eval | temp | Medium: create a small nested project with exact code and JSON files |
| `03-eval-hard-edit-and-summarize.scenario.json` | `03-eval-hard-edit-and-summarize` | LLM eval | temp | Hard: inspect seeded files, update code, create a derived summary, and preserve unrelated files |
| `04-eval-shell-exec-write.scenario.json` | `04-eval-shell-exec-write` | LLM eval | temp | Easy: run a shell command, write its output to a file |
| `slash-clear.scenario.json` | `slash-clear` | Non-LLM verification | repo | /clear resets history, clears the screen, and redraws the banner |
| `slash-eval-menu.scenario.json` | `slash-eval-menu` | Non-LLM verification | repo | /eval lists LLM eval scenarios with available checks in script mode |
| `slash-keys.scenario.json` | `slash-keys` | Non-LLM verification | repo | /keys command lists providers without crashing |
| `slash-model-list.scenario.json` | `slash-model-list` | Non-LLM verification | repo | /models aliases /model with no arg and prints current model without crashing |
| `slash-test-menu.scenario.json` | `slash-test-menu` | Non-LLM verification | repo | /test lists scenario tests without running one in script mode |
| `startup-help-exit.scenario.json` | `startup-help-exit` | Non-LLM verification | repo | Boot the CLI, print help, exit cleanly |
<!-- END GENERATED SCENARIOS -->
