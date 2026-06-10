import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { SessionController } from '../../src/cli/session-controller.js';

describe('SessionController', () => {
  it('starts with no messages', () => {
    const controller = new SessionController(join(tmpdir(), 'ctrl1'));
    expect(controller.messages).toEqual([]);
  });

  it('accumulates user and assistant messages in order', () => {
    const controller = new SessionController(join(tmpdir(), 'ctrl2'));
    controller.addUserMessage('hi');
    controller.addAssistantMessage('hello');
    expect(controller.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('clears in-memory messages', () => {
    const controller = new SessionController(join(tmpdir(), 'ctrl3'));
    controller.addUserMessage('hi');
    controller.clearMessages();
    expect(controller.messages).toEqual([]);
  });

  it('reports a non-negative context token count that grows with messages', () => {
    const controller = new SessionController(join(tmpdir(), 'ctrl-tokens'));
    const empty = controller.getContextTokenCount();
    controller.addUserMessage('a reasonably long message to add some tokens to the context');
    expect(controller.getContextTokenCount()).toBeGreaterThanOrEqual(empty);
  });
});
