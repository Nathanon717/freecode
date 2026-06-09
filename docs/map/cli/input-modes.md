# src/cli/input-modes.ts - Input Modes

**Role:** Builds the concrete `CliSessionMode` implementations for interactive TTY use and deterministic `--script` runs.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `createInteractiveMode` | `(rl, projectRoot, session, getSelectedModel, setSelectedModel) => CliSessionMode` | Raw-mode TTY input, autocomplete, model picker, tool approval menu, bottom UI hooks. |
| `createScriptedMode` | `(scriptPath, projectRoot) => CliSessionMode` | Reads non-empty script lines and feeds them through the same dispatcher. |

## Interactive Mode

- Uses raw stdin for prompt input.
- Supports Ctrl+C exit, Enter (`\r`) submit, Tab completion, Backspace, Delete, Escape clear, printable character input, and Ctrl+letter shortcuts for footer toggles (Ctrl+A = Ask, Ctrl+R = Read-only).
- Ctrl+J (`\n`) inserts a newline, enabling multi-line input. Arrow keys (Left/Right/Up/Down), Home, and End move the cursor within the buffer; Delete removes the character at the cursor.
- Shows inline command completion plus filtered suggestions from `slash-commands.ts`. Inline completion is suppressed for multi-line buffers.
- Starts an OpenAI-only preflight input-cost controller while editing, debounced from input changes and stopped on submit/cancel/teardown.
- Refreshes cached OpenAI daily spend snapshots for the footer when the bottom UI is active and the selected model is OpenAI.
- Tears down the bottom UI during command dispatch, agent output, config editor, model picker, and tool approval prompts.
- `/model` without an argument opens `runModelCommand()` so interactive users can pick from configured provider models and detected Ollama models.
- Tool approval uses a two-item Approve/Deny menu; denial can include user feedback to the agent. The Ask toggle (`getAskMode()` from `cli/toggles.ts`) controls whether approval is required at runtime; the initial state is seeded from `config.toolConfirmation`.
- The Read toggle (`isReadOnly()` from `cli/toggles.ts`) is passed as `getReadOnly` on the mode object. When on, only `read_file`, `grep`, and `list_dir` are offered to the model (write/edit/shell are omitted from `createTools`).

## Scripted Mode

- Reads the script file once, trimming trailing whitespace and dropping empty lines.
- Prints each scripted input with the same `> ` prompt shape.
- Tool approval consumes the next line only if it is `y/yes/approve/a` or `n/no/deny/d`.
- If a denial has a following line, that line is treated as the user's instruction after denial.
- `/test` and `/eval` print scenario lists instead of opening interactive menus.
- On EOF, prints `Goodbye!`.
