# src/cli/tool-approval.ts - Tool Approval Prompts

**Role:** Holds the interactive and scripted tool-approval UI shared by both `CliSessionMode` implementations in `cli/session-modes.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ToolApprovalChoice = "approve" | "deny";

getApprovalPreviewRowBudget(rowsAbove: ToolCallHeaderRows): number | null

askQuestion(rl: Interface, prompt: string): Promise<string>

confirmToolCallInteractive(rl: Interface, preview: ToolCallPreview): Promise<ToolCallConfirmation>

formatScriptedToolMenu(choice: ToolApprovalChoice): void

parseScriptedToolChoice(input: string | undefined): ToolApprovalChoice | null
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `getApprovalPreviewRowBudget(rowsAbove)` — how many terminal rows a pending-approval preview may occupy and still leave the content above it on screen; `null` when no footer UI is active (no hint is drawn, so the preview is unbounded). Lives here because the budget is this module's own geometry: `scrollHeight - header - APPROVAL_MENU_ROWS`, where that constant is the 2-line clearance pad plus the 1 hint row below. **Change the hint's shape and this constant must follow** — nothing checks them against each other, and a wrong value clips the header with no test failure. Called from `agent/tools/index.ts` at preview-write time: by the time `confirmToolCallInteractive` runs, the preview is already on the terminal and it is too late to trim. The header is treated as non-negotiable and `preamble` as best-effort — a preamble taller than the screen can never be held, so the budget stops yielding at `MIN_PREVIEW_ROWS` rather than starve the preview chasing it.
- `confirmToolCallInteractive` — Enter confirms; Escape throws `UserAbortError`, unwinding the turn so the user is returned to the input bar to redirect the agent there. There is deliberately no denial-feedback prompt and no selection to move: every other key is ignored. The absolute-positioned hint (`drawToolApprovalHintAbsolute`) draws no header row — the tool call header is already flowed into the transcript by `agent/tools/index.ts` just above. When `preview.previewedContent` is true (a read-only tool preview was also flowed there) and the hint is absolute-positioned (`isFooterUIActive()`), pads 2 blank lines before drawing — otherwise the hint's fixed bottom row can silently overwrite the tail of that preview once the scroll region fills. See the `Wrapper Stack` section of `agent/tools/index.md` for the full mechanism.
  - **Erasing the hint on settle:** the keypress handler writes **no** newline — the absolute hint sits on the scroll region's bottom margin, so a bare `\n` would scroll it up one line into the transcript before it could be cleared. The `finally` block does the erasing so the controls line never persists past the decision: footer runs clear the exact absolute row (`\x1b[row;1H\x1b[2K`), inline runs clear the parked cursor's line in place (`\r\x1b[2K`). See `docs/bug log/tool-approval-hint-persists.md`.
- `parseScriptedToolChoice` — accepts `y/yes/approve/a` (approve) or `n/no/deny/d` (deny); returns `null` for anything else. Scripted mode keeps its own deny-with-message flow (`ToolCallConfirmation.message`), which the interactive UI no longer offers; the field is still used by the read-only and scripted tool-call-cap denials in `cli/session-modes.ts`.

## Responsibilities

- Delegates the stdin raw-mode lifecycle (listener snapshot/restore, setRawMode, setEncoding) to `runRawKeySession` from `cli/raw-picker.ts`. Supplies `onCtrlC` (`pause` + `exit(0)`) and `onClose` (`pause`) to preserve the pause-on-close behavior the primitive does not own.
- Draws the confirm hint either inline or at an absolute row above the pinned footer (`isFooterUIActive()` chooses), parking the cursor so it doesn't drift into the footer.
- Non-TTY paths fall back to `rl.question` text prompts, where `deny` still means "tell the model no" rather than unwinding the turn — there is no Escape to press.
- Tears down the bottom UI while a prompt is shown and restores the input UI afterward.

## Read when

- Changing the approval hint, its keybindings, or the row budget the preview above it gets.
- Changing how scripted runs parse approve/deny lines.

## Key neighbors

- `cli/session-modes.ts` — sole consumer; wires these into interactive and scripted modes.
- `cli/raw-picker.ts` — provides `runRawKeySession` for the stdin lifecycle.
- `cli/bottom-ui.ts` — footer/bottom-UI state queried for absolute positioning and for the preview row budget.
- `agent/tools/index.ts` — `ToolCallPreview` / `ToolCallConfirmation` types.
