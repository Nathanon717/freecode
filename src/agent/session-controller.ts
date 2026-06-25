import type { CoreMessage } from 'ai';
import { estimateContextTokens } from '../agent/token-count.js';

export class SessionController {
  readonly projectRoot: string;
  messages: CoreMessage[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  clearMessages(): void {
    this.messages = [];
  }

  getContextTokenCount(): number {
    return estimateContextTokens(this.messages);
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }
}
