/**
 * @role Owns the in-memory conversation for a CLI session.
 */

import type { CoreMessage } from 'ai';
import { dropUnpairedToolCalls } from './turn-messages.js';

export class Conversation {
  readonly projectRoot: string;
  messages: CoreMessage[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Commit a whole turn at once: the user's message plus everything the turn
   * produced — the assistant's text, the tool calls it made, and the results
   * those calls returned — so the next turn continues from what actually
   * happened rather than from a prose summary of it.
   *
   * All-or-nothing on purpose. A turn that produced *nothing* (failed on the
   * provider's first byte, or drained with no text and no tool calls) leaves
   * history untouched, so the model is never shown a request it never answered
   * and dead turns stop accumulating cost. The caller therefore hands in the very
   * message it sent the model rather than appending it up front — see
   * `docs/bug log/28-07-2026.md`.
   *
   * Empty assistant turns are dropped: Mistral rejects any request containing an
   * assistant message with neither content nor tool_calls (HTTP 400, code 3240),
   * so one empty turn breaks every later request in the session — see
   * `docs/bug log/18-07-2026b.md`. That rule applies only to messages that are
   * *genuinely* empty: an assistant message carrying `tool_calls` and no text is
   * legal and load-bearing, and is exactly what a tool step looks like.
   *
   * `assistantText` is the fallback for turns that carry no messages of their
   * own (provider error, a throw mid-stream): the partial text they did emit,
   * if any. It is used only when the sanitized turn is empty, and the emptiness
   * decision is made *after* sanitizing — a turn whose only content was an unpaired tool
   * call counts as nothing, not as a reason to strand the user message.
   *
   * Returns false when nothing was committed.
   */
  commitTurn(userMessage: CoreMessage, turnMessages: CoreMessage[], assistantText: string): boolean {
    let tail = dropUnpairedToolCalls(turnMessages).filter((message) => {
      if (message.role !== 'assistant') return true;
      if (Array.isArray(message.content)) return message.content.length > 0;
      return Boolean(message.content.trim());
    });
    if (tail.length === 0 && assistantText.trim()) {
      tail = [{ role: 'assistant', content: assistantText }];
    }
    if (tail.length === 0) return false;
    // The very object the model was sent, so what it saw and what history holds
    // cannot drift.
    this.messages.push(userMessage, ...tail);
    return true;
  }
}
