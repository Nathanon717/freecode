# Tool-approval hint moved to the terminal's last row; footer hidden during the prompt

**Request:** `Enter to confirm · Esc to deny` should sit on the bottom line of the
terminal, with the footer not shown at all while the approval prompt is up.

**Before:** on the footer path the hint drew at the bottom of the scroll region
(`getRows() - reserved`, e.g. row 22), with the 2-row footer pinned below it on
rows 23–24.

**Change (`src/cli/tool-approval.ts`):** `drawToolApprovalHintAbsolute` now blanks
the footer's own rows and draws the hint on the terminal's **literal last row**
(`getRows()`), so the hint owns the bottom of the screen with no status bar
beneath it. The scroll region is left pinned the whole time (it still reserves
those rows). On settle the `finally` clears the last row, then `drawFooter`
repaints the footer and `parkCursorInScrollRegion` (or `setupInputUI` when the
input UI was up) restores the cursor.

**Dead end that shaped the fix:** the first attempt tore the footer down entirely
(`teardownFooterUI`) for the prompt and rebuilt it (`setupFooterUI`) on settle.
That churns the scroll region — `\x1b[r` (full screen) → rebuild to 1..22 →
`setupInputUI` scrolls again — and content emitted while the region is full-screen
feeds *scrollback* instead of the region. The agent's post-approval line
("Done listing.") ended up in scrollback *above* a re-rendered prompt/preview and
off the visible screen. `parkCursorInScrollRegion` did not help because the
problem was the region churn, not cursor position. Keeping the region pinned and
only blanking/repainting the footer rows fixed it.

**Timer gotcha (`src/cli/bottom-ui.ts`):** the hint now lives *in* the footer
rows, so the 1 s footer refresh timer would clobber it if footer content changed
mid-prompt (quota/spend/retry). `readToolApprovalMenu` calls `suspendFooterTimer`
before drawing and the caller's `finally` calls `resumeFooterTimer`. The timer's
suspend flag previously only gated the input-area redraw; it now early-returns and
writes nothing at all while suspended (also latently correct for the raw picker,
which already suspends and manages the footer manually).

**Also removed:** the `previewedContent` 2-blank-line clearance pad — with the hint
outside the scroll region on the last row, the read-only preview in the region can
no longer collide with it, so the pad (and its test) are gone. `_preview` is now
unused by `confirmToolCallInteractive`.

**Coverage:** `tests/cli/tool-approval.test.ts` — footer-path tests assert the
timer is frozen and the footer repainted on settle, the hint draws on row 24, and
the cursor is re-parked (or the input UI restored). The two
`tty-tool-approval-preview*` scenarios still assert the hint is absent after
approve and now also exercise the post-approval agent line rendering correctly.
The footer's *absence during* the prompt is not asserted in the scenarios: the
mock footer renders nothing observable during an agent turn, so a `screenAbsent`
check can't distinguish it — the unit tests carry that coverage instead.
