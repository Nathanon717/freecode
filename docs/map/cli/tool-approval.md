# src/cli/tool-approval.ts - Tool Approval Prompts

**Role:** Holds the interactive and scripted tool-approval UI shared by both `CliSessionMode` implementations in `cli/session-modes.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ToolApprovalChoice = "approve" | "deny";

getApprovalPreviewRowBudget(rowsAbove: ToolCallHeaderRows): number | null

askQuestion(rl: Interface, prompt: string): Promise<string>

confirmToolCallInteractive(rl: Interface, _preview: ToolCallPreview, getTokenCount?: (() => TokenCount) | undefined): Promise<ToolCallConfirmation>

formatScriptedToolMenu(choice: ToolApprovalChoice): void

parseScriptedToolChoice(input: string | undefined): ToolApprovalChoice | null
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `getApprovalPreviewRowBudget(rowsAbove)` — how many terminal rows a pending-approval preview may occupy and still leave the content above it on screen; `null` when no footer UI is active (no hint is drawn, so the preview is unbounded). Lives here because the budget is this module's own geometry: `scrollHeight - header - APPROVAL_MENU_ROWS`. That constant is held at 3 (the historical footer-plus-hint reservation); the hint now draws on the terminal's last row rather than inside the scroll region, so the constant is over-conservative but never clips the header. Called from `agent/tools/index.ts` at preview-write time: by the time `confirmToolCallInteractive` runs, the preview is already on the terminal and it is too late to trim. The header is treated as non-negotiable and `preamble` as best-effort — a preamble taller than the screen can never be held, so the budget stops yielding at `MIN_PREVIEW_ROWS` rather than starve the preview chasing it.
- `confirmToolCallInteractive` — Enter confirms; Escape throws `UserAbortError`, unwinding the turn so the user is returned to the input bar to redirect the agent there. There is deliberately no denial-feedback prompt and no selection to move: every other key is ignored. On the footer path (`isFooterUIActive()`) it draws no header row — the tool call header is already flowed into the transcript by `agent/tools/index.ts` just above.
  - **Token-count prefix:** the optional `getTokenCount` thunk (supplied by `cli/session-modes.ts`, closing over `preview.resultText` + the active model) yields a `{ tokens, exact }` that prefixes the hint with `+N tokens ·` (exact encoder) or `+N tokens appx ·` (generic estimate) — how much approving this read-only call adds to the model's context. It is a **thunk, not a value, and evaluated on a deferred timer**: the confirm controls paint immediately, then the hint repaints with the prefix once the count resolves. This is deliberate — the first count compiles the tokenizer (a one-time ~1 s synchronous cost), so evaluating it inline would stall the whole hint from appearing. The compile blocks the loop while it runs, but the controls are already on screen and any keypress queued during it is handled right after. This module stays model-agnostic: it invokes the thunk and renders the result, never touching the tokenizer itself. Omitted for tools with no precomputed result, where the prefix is empty.
  - **Footer hidden during the prompt:** the scroll region is left pinned (never torn down). `drawToolApprovalHintAbsolute` blanks the footer's own rows and draws the hint on the terminal's **literal last row**, so the hint owns the bottom of the screen with no status bar beneath it. The footer refresh timer is frozen for the prompt's duration (`suspendFooterTimer`) so its 1 s tick can't repaint the footer rows and clobber the hint. See `docs/bug log/tool-approval-footer-hidden.md`.
  - **Erasing the hint on settle:** the keypress handler writes **no** newline — the absolute hint sits on the terminal's last row, so a bare `\n` would scroll it up one line into the transcript before it could be cleared. The `finally` block does the erasing so the controls line never persists past the decision: footer runs clear the last row (`\x1b[rows;1H\x1b[2K`), then `resumeFooterTimer` + `drawFooter` repaint the footer and `parkCursorInScrollRegion` (or `setupInputUI` when the input UI was up) restores the cursor so continued transcript output flows from the scroll region's bottom. Inline runs clear the parked cursor's line in place (`\r\x1b[2K`). See `docs/bug log/tool-approval-hint-persists.md`.
    - **Windows/conpty:** before `session.close` releases raw mode, the footer path parks the cursor at the top (`\x1b[1;1H`). conpty echoes the buffered Enter CR as `\r\n` on the return to cooked mode; parked on the last row that newline scrolls the hint up a row so the `finally` clear misses it (same failure class as the bare-`\n` bug, different newline source). Parking off the row makes the echo scroll nothing. Inert on Linux (no CR echo) and on the inline path. See `docs/bug log/tool-approval-hint-conpty.md`.
- `parseScriptedToolChoice` — accepts `y/yes/approve/a` (approve) or `n/no/deny/d` (deny); returns `null` for anything else. Scripted mode keeps its own deny-with-message flow (`ToolCallConfirmation.message`), which the interactive UI no longer offers; the field is still used by the read-only and scripted tool-call-cap denials in `cli/session-modes.ts`.

## Responsibilities

- Delegates the stdin raw-mode lifecycle (listener snapshot/restore, setRawMode, setEncoding) to `runRawKeySession` from `cli/raw-picker.ts`. Supplies `onCtrlC` (`pause` + `exit(0)`) and `onClose` (`pause`) to preserve the pause-on-close behavior the primitive does not own.
- Draws the confirm hint either inline or, on the footer path (`isFooterUIActive()`), on the terminal's last row with the footer rows blanked and its refresh timer frozen; repaints the footer and re-parks the cursor on settle.
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
