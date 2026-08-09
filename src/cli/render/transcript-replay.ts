/**
 * @role Reprints the conversation after a full-screen wipe, so the screen never
 * claims less history than the model is actually being sent.
 *
 * @readwhen
 * changing what a menu leaves on screen, or what a replayed turn
 * shows.
 */

// Reprints the conversation after a full-screen wipe, so the screen never claims
// less history than the model is actually being sent.
//
// `/config`, `/model` and `/eval` all end in `redrawBanner()`, which clears the
// screen *and* scrollback (`\x1b[3J`) while leaving `Conversation.messages`
// untouched. The result reads as a fresh session that is anything but: the next
// turn still resends everything.
//
// Repainting from the screen buffer is not an option — the raw pickers' own
// cleanup writes `\x1b[J`, which `util/screen-buffer.ts` treats as a wipe, so the
// buffer is empty by the time a menu exits. Instead this replays
// `cli/render/transcript-record.ts`, the record of what the renderer actually put
// on screen, through the same `renderTurn` that drew it live. Same formatter,
// same inputs, same output — dividers, markdown, tool call lines, result previews
// and edit diffs all come back as they were, rather than as a summary of them.
//
// Only the conversation is replayed. Menu chrome, approval prompts and other
// ephemeral UI are not recorded (see transcript-record.ts) and do not come back.

import chalk from 'chalk';
import type { CoreMessage } from 'ai';
import { getTranscriptRecord, setTranscriptRecording } from './transcript-record.js';
import {
  formatPromptEcho,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
  renderTurn,
  resetTranscriptTurnState,
  type TranscriptRuntimeOptions,
} from './transcript-renderer.js';

/**
 * Reprint the recorded conversation. A no-op on an empty record, so `/clear`
 * (which empties it along with the history) still lands on a bare banner — there
 * the blank screen is accurate.
 *
 * `messages` is read only for the header count: the record is what was on screen,
 * while the history is what the model is sent, and the point of the header is to
 * state the latter.
 */
export function replayTranscript(
  messages: CoreMessage[],
  options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions(),
): void {
  const { entries, dropped } = getTranscriptRecord();
  if (entries.length === 0) return;

  const stream = getTranscriptStream(options);
  if (messages.length > 0) {
    stream.write(chalk.dim(`Conversation history (${messages.length} message${messages.length === 1 ? '' : 's'}, still sent to the model):\n`));
  }
  if (dropped > 0) {
    stream.write(chalk.dim(`  … ${dropped} earlier entr${dropped === 1 ? 'y' : 'ies'} not shown\n`));
  }
  stream.write('\n');

  // Start from a clean state machine so the first replayed turn does not open
  // with the divider the last live turn deferred, and stop recording so the
  // replay does not append itself to the record it is reading.
  setTranscriptRecording(false);
  resetTranscriptTurnState();
  let replayedTurn = false;
  try {
    for (const entry of entries) {
      if (entry.kind === 'prompt') {
        stream.write(formatPromptEcho(entry.text) + '\n');
        continue;
      }
      renderTurn(entry.steps, options);
      replayedTurn = true;
    }
  } finally {
    // Leave the machine as a completed turn would, so the next live turn is
    // separated from the replay exactly as it would have been from the original.
    resetTranscriptTurnState(replayedTurn);
    setTranscriptRecording(true);
  }
}
