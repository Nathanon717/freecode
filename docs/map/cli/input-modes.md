# src/cli/input-modes.ts - Input Modes

**Role:** Builds the concrete `CliSessionMode` implementations for interactive TTY use and deterministic `--script` runs.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `denyToolCallWithPreview` | `(preview) => Promise<ToolCallConfirmation>` | Prints a tool request and denies it. Used by `--test`. |
| `createInteractiveMode` | `(rl, projectRoot, session, getSelectedModel, setSelectedModel) => CliSessionMode` | Raw-mode TTY input, autocomplete, model picker, tool approval menu, bottom UI hooks. |
| `createScriptedMode` | `(scriptPath, projectRoot) => CliSessionMode` | Reads non-empty script lines and feeds them through the same dispatcher. |

## Interactive Mode

- Uses raw stdin for prompt input.
- Supports Ctrl+C exit, Enter submit, Tab completion, Backspace, Escape clear, and printable character input.
- Shows inline command completion plus filtered suggestions from `slash-commands.ts`.
- Tears down the bottom UI during agent output, config editor, model picker, and tool approval prompts.
- `/model` without an argument opens `runModelCommand()` so interactive users can pick from configured provider models and detected Ollama models.
- Tool approval uses a two-item Approve/Deny menu; denial can include user feedback to the agent.

## Scripted Mode

- Reads the script file once, trimming trailing whitespace and dropping empty lines.
- Prints each scripted input with the same `> ` prompt shape.
- Tool approval consumes the next line only if it is `y/yes/approve/a` or `n/no/deny/d`.
- If a denial has a following line, that line is treated as the user's instruction after denial.
- `/test` and `/eval` print scenario lists instead of opening interactive menus.
- On EOF, prints `Goodbye!`.
