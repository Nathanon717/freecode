import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { Conversation } from '../../src/agent/conversation.js';

describe('Conversation', () => {
  it('starts with no messages', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl1'));
    expect(controller.messages).toEqual([]);
  });

  it('accumulates turns in order', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl2'));
    controller.commitTurn({ role: 'user', content: 'hi' }, [], 'hello');
    controller.commitTurn({ role: 'user', content: 'again' }, [], 'hello again');
    expect(controller.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'again' },
      { role: 'assistant', content: 'hello again' },
    ]);
  });

  it('clears in-memory messages', () => {
    const controller = new Conversation(join(tmpdir(), 'ctrl3'));
    controller.commitTurn({ role: 'user', content: 'hi' }, [], 'hello');
    controller.clearMessages();
    expect(controller.messages).toEqual([]);
  });

  describe('commitTurn', () => {
    it('keeps tool calls and their results, so the next turn sees the work', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl5'));
      const committed = controller.commitTurn({ role: 'user', content: 'read a.ts' }, [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: { path: 'a.ts' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'body' }] },
        { role: 'assistant', content: 'It says body.' },
      ], 'It says body.');
      expect(committed).toBe(true);
      expect(controller.messages).toHaveLength(4);
      expect(controller.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });

    it('keeps a tool-call-only assistant message (legal — no text is not "empty")', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl6'));
      controller.commitTurn({ role: 'user', content: 'read a.ts' }, [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: {} }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'x' }] },
      ], '');
      expect(controller.messages).toHaveLength(3);
    });

    it('drops a genuinely empty assistant message and, with it, the whole turn', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl7'));
      const committed = controller.commitTurn({ role: 'user', content: 'hi' }, [{ role: 'assistant', content: '  ' }], '  \n ');
      expect(committed).toBe(false);
      expect(controller.messages).toEqual([]);
    });

    it('strands nothing when a turn produced neither messages nor text (abort, provider error)', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl8'));
      expect(controller.commitTurn({ role: 'user', content: 'hi' }, [], '')).toBe(false);
      expect(controller.messages).toEqual([]);
    });

    it('never persists a tool call whose result is missing', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl9'));
      const committed = controller.commitTurn({ role: 'user', content: 'hi' }, [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'orphan', toolName: 'read', args: {} }] },
      ], '');
      // Sanitizing left nothing, so this is a turn that produced nothing —
      // committing the user message alone would strand it exactly as before.
      expect(committed).toBe(false);
      expect(controller.messages).toEqual([]);
    });

    it('falls back to the partial text when a failed turn carries no messages', () => {
      const controller = new Conversation(join(tmpdir(), 'ctrl10'));
      expect(controller.commitTurn({ role: 'user', content: 'hi' }, [], 'I started to say')).toBe(true);
      expect(controller.messages).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'I started to say' },
      ]);
    });
  });
});
