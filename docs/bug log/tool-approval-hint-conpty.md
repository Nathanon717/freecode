# Tool-approval controls line persisted after confirm/deny — Windows/conpty only

**Symptom:** The `tty-tool-approval-preview` and `tty-tool-approval-preview-fits`
scenarios passed on Linux but failed on Windows: after Enter confirmed the tool
call, `Enter to confirm · Esc to deny` was still on screen (`screenAbsent`
violated).

**Cause (`src/cli/tool-approval.ts` + conpty):** the footer-path hint is drawn
*absolute* on the scroll region's bottom margin (`drawToolApprovalHintAbsolute`),
and the cursor is parked there. When `runRawKeySession`'s cleanup calls
`setRawMode(false)`, conpty echoes the buffered Enter CR as `\r\n` on the return
to cooked mode. Parked on the bottom margin, that newline scrolls the hint up one
row *before* the `finally` block's `\x1b[row;1H\x1b[2K` runs — so the clear lands
on the now-blank margin and the hint survives one row higher, then scrolls into
the transcript with the following output.

This is the **same failure class** as [17-07-2026b.md](17-07-2026b.md) (a newline
at the bottom margin scrolls the hint before the clear), but a different newline
source: that bug was an app-emitted `\n`; this one is conpty's CR echo, which
never happens on Linux (raw mode consumed the CR).

**Confirmed** with two sentinel writes around cleanup — `[22;23H\r\n` fell
between `setRawMode(false)` and the `finally` clear on Windows, absent on Linux.

**Fix:** before `session.close` releases raw mode, the footer path parks the
cursor at the top (`\x1b[1;1H`) so the echoed newline scrolls nothing; the hint
stays on its row for the `finally` clear to catch. Inert on Linux and on the
inline (non-footer) path.

**Coverage:** the two `tty-tool-approval-preview*` scenarios already assert
`screenAbsent` for the controls line on the approve step; they now pass on both
platforms.
