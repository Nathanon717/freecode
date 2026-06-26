# src/cli/tool-approval.ts - Tool Approval Prompts

**Role:** Holds the interactive and scripted tool-approval UI shared by both `CliSessionMode` implementations in `cli/session-modes.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ToolApprovalChoice = "approve" | "deny";

askQuestion(rl: Interface, prompt: string): Promise<string>

confirmToolCallInteractive(rl: Interface, preview: ToolCallPreview): Promise<ToolCallConfirmation>

formatScriptedToolMenu(choice: ToolApprovalChoice): void

parseScriptedToolChoice(input: string | undefined): ToolApprovalChoice | null

askContinueAfterLimit(rl: Interface, count: number): Promise<boolean>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `confirmToolCallInteractive` — throws `UserAbortError` on Escape.
- `parseScriptedToolChoice` — accepts `y/yes/approve/a` (approve) or `n/no/deny/d` (deny); returns `null` for anything else.

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
