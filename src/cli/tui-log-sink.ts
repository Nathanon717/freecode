/**
 * @role Log sink that writes diagnostic lines into the scroll region instead of wherever the cursor is parked, so background logging cannot paint over the bottom UI.
 *
 * @readwhen
 * - A log line appears mid-screen, on top of the input frame or footer separator.
 * - Changing where background diagnostics land relative to the transcript.
 */

import type { LogSink } from '../logger.js';
import {
  isFooterUIActive,
  isBottomUIActive,
  isFooterTimerSuspended,
  parkCursorInScrollRegion,
  drawBottomUI,
  drawFooter,
} from './chrome/bottom-ui.js';

/**
 * Builds the sink registered by the interactive entrypoint.
 *
 * With no footer up (headless, `-p`, piped output) this is plain stderr, unchanged. With the
 * footer up the cursor is parked at the typing position inside the input frame, so a raw
 * write would overwrite the frame and the separator row: park at the bottom of the scroll
 * region first, so the line scrolls the transcript exactly like ordinary output, then repaint
 * the chrome to put the cursor back. Output goes to stdout in that case because only stdout
 * is recorded by the screen buffer, and a line living in the scroll region has to survive a
 * resize repaint like the rest of the transcript.
 *
 * Raw mode leaves `\n` as a bare line feed, so multi-line payloads (stack traces) need CRLF
 * or every line after the first starts at the column the previous one ended on.
 *
 * The repaint is skipped while the footer timer is suspended, for the reason the timer
 * itself skips: a raw picker or the approval prompt is managing those rows by hand, and
 * `drawFooter` would clobber what it drew there. `/model` makes that overlap the common
 * case rather than a corner one — opening the picker is what fetches the model lists, so
 * the registry's own log is likeliest to arrive with the picker up.
 */
export function createTuiLogSink(): LogSink {
  return (line: string) => {
    if (!isFooterUIActive()) {
      process.stderr.write(line);
      return;
    }
    parkCursorInScrollRegion();
    process.stdout.write(line.replace(/\r?\n/g, '\r\n'));
    if (isFooterTimerSuspended()) return;
    if (isBottomUIActive()) drawBottomUI();
    else drawFooter();
  };
}
