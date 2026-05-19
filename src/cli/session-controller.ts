import type { CoreMessage } from 'ai';
import {
  createSession,
  getLastSession,
  getSessionMessages,
  saveMessage,
} from '../db/client.js';
import { estimateContextTokens } from '../agent/token-count.js';
import { resetAnthropicSessionCost } from '../providers/anthropic-cost.js';
import { resetOpenAISessionCost } from '../providers/openai-cost.js';

export class SessionController {
  readonly projectRoot: string;
  messages: CoreMessage[] = [];
  currentSessionId: string | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  createSession(): void {
    this.currentSessionId = createSession(this.projectRoot).id;
    resetAnthropicSessionCost();
    resetOpenAISessionCost();
  }

  resumeLast(): { id: string; messageCount: number } | null {
    const lastSession = getLastSession(this.projectRoot);
    if (!lastSession) return null;

    this.currentSessionId = lastSession.id;
    const oldMessages = getSessionMessages(this.currentSessionId);
    this.messages = oldMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
    } as CoreMessage));

    return { id: this.currentSessionId, messageCount: this.messages.length };
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

  saveExchange(userInput: string, assistantText: string, totalTokens: number | null | undefined): void {
    if (!this.currentSessionId) return;
    saveMessage(this.currentSessionId, 'user', userInput, null);
    saveMessage(this.currentSessionId, 'assistant', assistantText, totalTokens ?? null);
  }
}
