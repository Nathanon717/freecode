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

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /**
   * Empty assistant turns (tool-only steps, aborts) carry no information and
   * poison the history: Mistral rejects any request containing an assistant
   * message with neither content nor tool_calls (HTTP 400, code 3240), so one
   * empty turn breaks every later request in the session. Consecutive user
   * messages are accepted, so dropping it is safe.
   */
  addAssistantMessage(content: string): void {
    if (!content.trim()) return;
    this.messages.push({ role: 'assistant', content });
  }

  /**
   * Append everything a turn produced — the assistant's text, the tool calls it
   * made, and the results those calls returned — so the next turn continues from
   * what actually happened rather than from a prose summary of it.
   *
   * The empty-assistant rule above still applies, but only to messages that are
   * *genuinely* empty: an assistant message carrying `tool_calls` and no text is
   * legal and load-bearing, and is exactly what a tool step looks like. That is
   * the distinction — no content AND no tool calls is what Mistral rejects.
   *
   * Returns false when nothing was appended, so the caller can fall back to
   * recording the final text alone (error and abort paths yield no messages).
   */
  addTurnMessages(messages: CoreMessage[]): boolean {
    const safe = dropUnpairedToolCalls(messages).filter((message) => {
      if (message.role !== 'assistant') return true;
      if (Array.isArray(message.content)) return message.content.length > 0;
      return Boolean(message.content.trim());
    });
    if (safe.length === 0) return false;
    this.messages.push(...safe);
    return true;
  }
}
