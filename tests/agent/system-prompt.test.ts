import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('lists all available tools', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('read');
    expect(prompt).toContain('create');
    expect(prompt).toContain('edit');
    expect(prompt).toContain('grep');
    expect(prompt).toContain('shell_exec');
    expect(prompt).toContain('list_dir');
  });

  it('omits spawn_agent when the caller does not supply it', () => {
    // runParsedToolsLoop builds createTools without a spawnAgent runner, so the
    // prompt must not advertise a tool that mode cannot call. See loop.ts.
    const prompt = buildSystemPrompt(false, false);
    expect(prompt).not.toContain('spawn_agent');
    expect(prompt).toContain('shell_exec');
  });

  it('mentions the current OS', () => {
    const prompt = buildSystemPrompt();
    const expected = process.platform === 'win32' ? 'Windows' : 'Linux';
    expect(prompt).toContain(expected);
  });
});
