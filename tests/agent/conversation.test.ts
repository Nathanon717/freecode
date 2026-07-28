import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { Conversation } from '../../src/agent/conversation.js';

describe('Conversation', () => {
  it('starts with no messages', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl1'));
    expect(controller.messages).toEqual([]);
  });

  it('accumulates user and assistant messages in order', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl2'));
    controller.addUserMessage('hi');
    controller.addAssistantMessage('hello');
    expect(controller.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('drops empty assistant turns (Mistral rejects content-less assistant messages)', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl4'));
    controller.addUserMessage('hi');
    controller.addAssistantMessage('');
    controller.addAssistantMessage('   \n ');
    controller.addUserMessage('still there?');
    expect(controller.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'still there?' },
    ]);
  });

  it('clears in-memory messages', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl3'));
    controller.addUserMessage('hi');
    controller.clearMessages();
    expect(controller.messages).toEqual([]);
  });

  describe('addTurnMessages', () => {
    it('keeps tool calls and their results, so the next turn sees the work', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl5'));
      controller.addUserMessage('read a.ts');
      const appended = controller.addTurnMessages([
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: { path: 'a.ts' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'body' }] },
        { role: 'assistant', content: 'It says body.' },
      ]);
      expect(appended).toBe(true);
      expect(controller.messages).toHaveLength(4);
      expect(controller.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });

    it('keeps a tool-call-only assistant message (legal — no text is not "empty")', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl6'));
      controller.addTurnMessages([
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: {} }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'x' }] },
      ]);
      expect(controller.messages).toHaveLength(2);
    });

    it('still drops a genuinely empty assistant message', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl7'));
      const appended = controller.addTurnMessages([{ role: 'assistant', content: '  ' }]);
      expect(appended).toBe(false);
      expect(controller.messages).toEqual([]);
    });

    it('reports false on an empty turn so the caller can fall back to the text', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl8'));
      expect(controller.addTurnMessages([])).toBe(false);
      expect(controller.messages).toEqual([]);
    });

    it('never persists a tool call whose result is missing', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl9'));
      const appended = controller.addTurnMessages([
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'orphan', toolName: 'read', args: {} }] },
      ]);
      expect(appended).toBe(false);
      expect(controller.messages).toEqual([]);
    });
  });
});
