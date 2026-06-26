# src/cli/session-modes.ts - Session Modes

**Role:** Builds the concrete `CliSessionMode` implementations for interactive TTY use and deterministic `--script` runs.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createInteractiveMode(rl: Interface, projectRoot: string, session: SessionController, getSelectedModel: () => string, setSelectedModel: (model: string) => void): CliSessionMode

createScriptedMode(scriptPath: string, projectRoot: string, rl: Interface): CliSessionMode
```
<!-- END GENERATED EXPORTS -->

## Interactive Mode

- Uses raw stdin for prompt input via `runRawKeySession` (from `cli/raw-picker.ts`), which owns the listener snapshot/restore and raw-mode lifecycle. This prevents readline from echoing typed characters into `process.stdout` and contaminating the screen-buffer epoch used by the suggestion overlay restore.
- Supports Ctrl+C exit, Enter (`\r`) submit, Tab completion, Backspace, Delete, Escape clear, printable character input, and Ctrl+letter shortcuts for footer toggles (Ctrl+A = Ask, Ctrl+R = Read-only).
- Ctrl+J (`\n`) inserts a newline, enabling multi-line input. Arrow keys (Left/Right/Up/Down), Home, and End move the cursor within the buffer; Delete removes the character at the cursor.
- Shows inline command completion plus filtered suggestions from `slash-commands.ts`. Inline completion is suppressed for multi-line buffers.
- Starts an OpenAI-only preflight input-cost controller while editing, debounced from input changes and stopped on submit/cancel/teardown.
- Refreshes cached OpenAI daily spend snapshots for the footer when the bottom UI is active and the selected model is OpenAI.
- Tears down the bottom UI during command dispatch, agent output, and tool approval prompts. The config editor and model picker manage their own teardown/restore via `cli/menu-shell.ts`; the dispatcher's `runConfig`/`runModelMenu` are now thin calls that pass an `onRestore` closure (session footer refresh — `applyModelChange`/`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`) into `runConfigCommand`/`runModelCommand` for the shell to fire after `setupBottomUI`.
- `/model` without an argument opens `runModelCommand()` so interactive users can pick from configured provider models and detected Ollama models.
- Tool approval uses a two-item Approve/Deny menu; denial can include user feedback to the agent. The Ask toggle (`getAskMode()` from `cli/toggles.ts`) controls whether approval is required at runtime; the initial state is seeded from `config.toolConfirmation`. The approval prompts, the tool-call-limit prompt, and the scripted-choice parser live in `cli/tool-approval.ts`; both modes import them.
- The Read toggle (`isReadOnly()` from `cli/toggles.ts`) is passed as `getReadOnly` on the mode object. When on, only `read`, `grep`, and `list_dir` are offered to the model (write/edit/shell are omitted from `createTools`).

## Scripted Mode

- Reads the script file once, trimming trailing whitespace and dropping empty lines.
- Tool approval consumes the next line only if it is `y/yes/approve/a` or `n/no/deny/d`.
- If a denial has a following line, that line is treated as the user's instruction after denial.
- `/test` and `/eval` print scenario lists instead of opening interactive menus.
- On EOF, prints `Goodbye!`.
