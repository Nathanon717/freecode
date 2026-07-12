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

  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }
}
