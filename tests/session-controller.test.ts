import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// SessionController -> db/client both resolve their storage path from FREECODE_HOME
// at module load, so we set it to a temp dir and dynamically import afterwards.
let mod: typeof import('../src/cli/session-controller.js');
let db: typeof import('../src/db/client.js');
let tempHome = '';
const previousHome = process.env.FREECODE_HOME;

beforeAll(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-session-'));
  process.env.FREECODE_HOME = tempHome;
  mod = await import('../src/cli/session-controller.js');
  db = await import('../src/db/client.js');
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  rmSync(tempHome, { recursive: true, force: true });
});

describe('db/client', () => {
  it('creates a session and reads it back as the last session for its root', () => {
    const root = join(tempHome, 'projA');
    const session = db.createSession(root);
    expect(session.id).toBeTruthy();
    expect(session.project_root).toBe(root);
    expect(db.getLastSession(root)?.id).toBe(session.id);
  });

  it('returns undefined for a project with no sessions', () => {
    expect(db.getLastSession(join(tempHome, 'nonexistent-root'))).toBeUndefined();
  });

  it('saves messages and returns them ordered by id', () => {
    const session = db.createSession(join(tempHome, 'projMsgs'));
    db.saveMessage(session.id, 'user', 'first', null);
    db.saveMessage(session.id, 'assistant', 'second', 42);
    const messages = db.getSessionMessages(session.id);
    expect(messages.map(m => m.content)).toEqual(['first', 'second']);
    expect(messages[1].token_count).toBe(42);
  });

  it('isolates messages by session id', () => {
    const a = db.createSession(join(tempHome, 'iso'));
    const b = db.createSession(join(tempHome, 'iso'));
    db.saveMessage(a.id, 'user', 'for-a', null);
    expect(db.getSessionMessages(b.id)).toHaveLength(0);
  });
});

describe('SessionController', () => {
  it('starts with no messages and no session id', () => {
    const controller = new mod.SessionController(join(tempHome, 'ctrl1'));
    expect(controller.messages).toEqual([]);
    expect(controller.currentSessionId).toBeNull();
  });

  it('accumulates user and assistant messages in order', () => {
    const controller = new mod.SessionController(join(tempHome, 'ctrl2'));
    controller.addUserMessage('hi');
    controller.addAssistantMessage('hello');
    expect(controller.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('clears in-memory messages', () => {
    const controller = new mod.SessionController(join(tempHome, 'ctrl3'));
    controller.addUserMessage('hi');
    controller.clearMessages();
    expect(controller.messages).toEqual([]);
  });

  it('does not persist an exchange when no session has been started', () => {
    const root = join(tempHome, 'ctrl-nosession');
    const controller = new mod.SessionController(root);
    controller.saveExchange('q', 'a', 5);
    const last = db.getLastSession(root);
    expect(last).toBeUndefined();
  });

  it('persists an exchange and resumes it from a fresh controller', () => {
    const root = join(tempHome, 'ctrl-resume');
    const writer = new mod.SessionController(root);
    writer.createSession();
    expect(writer.currentSessionId).toBeTruthy();
    writer.saveExchange('what is 2+2', '4', 7);

    const reader = new mod.SessionController(root);
    const resumed = reader.resumeLast();
    expect(resumed).not.toBeNull();
    expect(resumed?.messageCount).toBe(2);
    expect(reader.messages).toEqual([
      { role: 'user', content: 'what is 2+2' },
      { role: 'assistant', content: '4' },
    ]);
  });

  it('resumeLast returns null when there is nothing to resume', () => {
    const controller = new mod.SessionController(join(tempHome, 'ctrl-empty-resume'));
    expect(controller.resumeLast()).toBeNull();
  });

  it('reports a non-negative context token count that grows with messages', () => {
    const controller = new mod.SessionController(join(tempHome, 'ctrl-tokens'));
    const empty = controller.getContextTokenCount();
    controller.addUserMessage('a reasonably long message to add some tokens to the context');
    expect(controller.getContextTokenCount()).toBeGreaterThanOrEqual(empty);
  });
});
