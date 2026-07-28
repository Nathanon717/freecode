// Reprints the conversation after a full-screen wipe, so the screen never claims
// less history than the model is actually being sent.
//
// `/config`, `/model` and `/eval` all end in `redrawBanner()`, which clears the
// screen *and* scrollback (`\x1b[3J`) while leaving `Conversation.messages`
// untouched. The result reads as a fresh session that is anything but: the next
// turn still resends everything. Repainting from the screen buffer is not an
// option — the raw pickers' own cleanup writes `\x1b[J`, which
// `util/screen-buffer.ts` treats as a wipe, so the buffer is empty by the time a
// menu exits. Rendering from `messages` instead makes screen-matches-history
// true by construction rather than by bookkeeping.
//
// This is a summary, not a re-run of the original stream: one line per tool call
// and no result bodies. Tool results are the bulk of a turn and replaying them
// would bury the conversation they belong to.

import chalk from 'chalk';
import type { CoreMessage } from 'ai';
import { formatToolCallLine } from './transcript-renderer.js';

/** Messages to replay in full before collapsing the rest into a count line. */
const MAX_REPLAYED_MESSAGES = 40;

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: string; text: string } =>
      typeof part === 'object' && part !== null &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string')
    .map((part) => part.text)
    .join('');
}

function toolCallLines(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const lines: string[] = [];
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue;
    const { type, toolName, args } = part as { type?: unknown; toolName?: unknown; args?: unknown };
    if (type !== 'tool-call') continue;
    lines.push(formatToolCallLine(
      typeof toolName === 'string' ? toolName : 'tool',
      (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>,
    ));
  }
  return lines;
}

/**
 * Print a condensed replay of `messages`. A no-op on empty history, so `/clear`
 * (which empties it) still lands on a bare banner — there the blank screen is
 * accurate.
 */
export function replayTranscript(messages: CoreMessage[], write: (s: string) => void = (s) => process.stdout.write(s)): void {
  if (messages.length === 0) return;

  const hidden = Math.max(0, messages.length - MAX_REPLAYED_MESSAGES);
  const shown = messages.slice(hidden);

  write(chalk.dim(`Conversation history (${messages.length} message${messages.length === 1 ? '' : 's'}, still sent to the model):\n`));
  if (hidden > 0) write(chalk.dim(`  … ${hidden} earlier message${hidden === 1 ? '' : 's'} not shown\n`));
  write('\n');

  for (const message of shown) {
    // Tool results are deliberately not replayed — see the header comment.
    if (message.role === 'tool') continue;

    const text = textOf(message.content).trim();
    if (message.role === 'user') {
      if (text) write(chalk.dim('> ') + text + '\n\n');
      continue;
    }
    if (message.role !== 'assistant') continue;

    if (text) write(text + '\n');
    for (const line of toolCallLines(message.content)) write(line + '\n');
    write('\n');
  }
}
