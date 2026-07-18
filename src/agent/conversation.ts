import type { CoreMessage } from 'ai';

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
}
