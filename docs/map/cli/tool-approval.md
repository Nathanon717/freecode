# src/cli/tool-approval.ts - Tool Approval Prompts

**Role:** Holds the interactive and scripted tool-approval UI shared by both `CliSessionMode` implementations in `cli/session-modes.ts`.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `askQuestion` | `(rl, prompt) => Promise<string>` | Promise wrapper around `rl.question`. |
| `confirmToolCallInteractive` | `(rl, preview) => Promise<ToolCallConfirmation>` | Raw-mode Approve/Deny menu; denial collects a feedback message. Throws `UserAbortError` on Escape. |
| `formatScriptedToolMenu` | `(choice) => void` | Prints the Approve/Deny menu for scripted runs. |
| `parseScriptedToolChoice` | `(input) => "approve" \| "deny" \| null` | Parses a scripted line into a choice (`y/yes/approve/a`, `n/no/deny/d`). |
| `askContinueAfterLimit` | `(rl, count) => Promise<boolean>` | Prompts to continue after the per-turn tool-call limit. |

## Responsibilities

- Delegates the stdin raw-mode lifecycle (listener snapshot/restore, setRawMode, setEncoding) to `runRawKeySession` from `cli/raw-picker.ts`. Supplies `onCtrlC` (`pause` + `exit(0)`) and `onClose` (`pause`) to preserve the pause-on-close behavior the primitive does not own.
- Draws the menu either inline or at absolute rows above the pinned footer (`isFooterUIActive()` chooses), parking the cursor so it doesn't drift into the footer.
- Non-TTY paths fall back to `rl.question` text prompts.
- Tears down the bottom UI while a prompt is shown and restores the input UI afterward.

## Read when

- Changing the tool approval menu, its keybindings, or the denial-feedback flow.
- Changing how scripted runs parse approve/deny lines.

## Key neighbors

- `cli/session-modes.ts` — sole consumer; wires these into interactive and scripted modes.
- `cli/raw-picker.ts` — provides `runRawKeySession` for the stdin lifecycle.
- `cli/terminal-ui.ts` — footer/bottom-UI state queried for absolute positioning.
- `agent/tools/index.ts` — `ToolCallPreview` / `ToolCallConfirmation` types, `filterArgs`/`formatArgs`.
