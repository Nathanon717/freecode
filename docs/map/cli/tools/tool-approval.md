# src/cli/tools/tool-approval.ts - Tool Approval Prompts

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Holds the interactive and scripted tool-approval UI shared by both `CliSessionMode` implementations in `cli/session-modes.ts`.

## Read When

- Changing the approval hint, its keybindings, or the row budget the preview above it gets.
- Changing how scripted runs parse approve/deny lines.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ToolApprovalChoice = "approve" | "deny";

/**
 * Rows a pending-approval preview may occupy and still leave the content above it
 * on screen once this hint draws. The preview flows into the current scroll region
 * directly under the header, so anything past this budget scrolls the header — and
 * the call the user is approving — out of view; the caller truncates the preview
 * instead. Returns null when no footer UI is active: those runs draw no hint and
 * want the full preview.
 *
 * The header is non-negotiable, the preamble is best-effort: a preamble longer than
 * the screen can never be held, and shrinking the preview to nothing chasing it
 * helps no one (`MIN_PREVIEW_ROWS`).
 *
 * `agent/tools/index.ts` calls this at preview-*write* time, not at confirm time:
 * by the time `confirmToolCallInteractive` runs the preview is already on the
 * terminal and it is too late to trim.
 */
getApprovalPreviewRowBudget(rowsAbove: ToolCallHeaderRows): number | null

askQuestion(rl: Interface, prompt: string): Promise<string>

/**
 * Ask the user to approve one tool call. Enter confirms; Escape resolves
 * `{ approved: false, stopTurn: true }` — a denial like any other, not a thrown
 * abort. There is deliberately no denial-feedback prompt and no selection to
 * move, so every other key is ignored.
 *
 * This is the **only** producer of `stopTurn`. A plain Deny, a read-only-mode
 * denial and the scripted tool-call cap are all ordinary denials that let the
 * turn continue. The flag is honoured in the tools layer
 * (`agent/tools/wrappers.ts` `withTurnStop`), not here and not in
 * `cli/session-modes.ts`, which passes the confirmation straight through: the
 * usual `Tool call denied by user: …` result renders, and only then does the turn
 * end. Two earlier designs failed here — Escape threw `UserAbortError` and unwound
 * the whole turn, discarding completed tool calls; then it denied without
 * stopping, so the model was called again for every auto-denial (both in
 * `docs/bug log/05-08-2026.md`).
 *
 * `getTokenCount` is a **thunk, not a value, and is evaluated on a deferred
 * timer**: it yields a `{ tokens, exact }` prefixing the hint with `+N tokens ·`
 * (exact encoder) or `+N tokens appx ·` (generic estimate) — how much approving a
 * read-only call adds to the model's context. The controls paint immediately and
 * the hint repaints with the prefix once the count resolves, because the first
 * count compiles the tokenizer (a one-time ~1s synchronous cost) and evaluating it
 * inline would stall the hint from appearing at all. This module stays
 * model-agnostic: it invokes the thunk and renders the result, never touching the
 * tokenizer. Omitted for tools with no precomputed result.
 *
 * On the footer path (`isFooterUIActive()`) it draws no header row — the tool call
 * header is already flowed into the transcript by `agent/tools/index.ts` just above.
 */
confirmToolCallInteractive(rl: Interface, _preview: ToolCallPreview, getTokenCount?: (() => TokenCount) | undefined): Promise<ToolCallConfirmation>

formatScriptedToolMenu(choice: ToolApprovalChoice): void

/**
 * Accepts `y`/`yes`/`approve`/`a` (approve) or `n`/`no`/`deny`/`d` (deny); null
 * for anything else. Scripted mode keeps its own deny-with-message flow
 * (`ToolCallConfirmation.message`), which the interactive UI no longer offers;
 * that field is still used by the read-only and scripted tool-call-cap denials in
 * `cli/session-modes.ts`.
 */
parseScriptedToolChoice(input: string | undefined): ToolApprovalChoice | null
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/bottom-ui.ts`](../chrome/bottom-ui.md) ×16, [`tokenizers/count.ts`](../../tokenizers/count.md) ×7, [`agent/tools/index.ts`](../../agent/tools/index.md) ×2, [`cli/chrome/turn-state.ts`](../chrome/turn-state.md) ×2, [`cli/menus/raw-picker.ts`](../menus/raw-picker.md) ×1, [`cli/render/transcript-renderer.ts`](../render/transcript-renderer.md) ×1
- **Imported by:** [`cli/scripted-mode.ts`](../scripted-mode.md) ×3, [`cli/session-modes.ts`](../session-modes.md) ×2, [`agent/tools/wrappers.ts`](../../agent/tools/wrappers.md) ×1

## Tests

`tests/cli/tools/tool-approval.test.ts`. 1 other test file references it.

## Budget

344 / 500 lines (156 to spare).
<!-- END GENERATED MAP FACTS -->

## Responsibilities

- Delegates the stdin raw-mode lifecycle (listener snapshot/restore, setRawMode, setEncoding) to `runRawKeySession` from `cli/menus/raw-picker.ts`. Supplies `onCtrlC` (`pause` + `exit(0)`) and `onClose` (`pause`) to preserve the pause-on-close behavior the primitive does not own.
- Draws the confirm hint either inline or, on the footer path (`isFooterUIActive()`), on the terminal's last row with the footer rows blanked and its refresh timer frozen; repaints the footer and re-parks the cursor on settle.
- Non-TTY paths fall back to `rl.question` text prompts, where `deny` means "tell the model no" — the same outcome as a TTY Deny, just with no Escape key and so no `stopTurn` to set; the turn continues.
- Tears down the bottom UI while a prompt is shown and restores the input UI afterward.
