import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';
import { offeredToolNames } from '../../src/agent/tools/tool-names.js';

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
    const prompt = buildSystemPrompt(false, offeredToolNames({ spawnAgent: false }));
    expect(prompt).not.toContain('spawn_agent');
    expect(prompt).toContain('shell_exec');
  });

  describe('read-only', () => {
    // A read-only session (Ctrl+R, or `freecode -p`) gets a strictly smaller tool
    // set from createTools. The prompt used to hardcode the full list, so the model
    // was told it could edit and would waste turns calling tools that were absent.
    const prompt = buildSystemPrompt(false, offeredToolNames({ readOnly: true }));

    it('advertises only the read-only tools', () => {
      expect(prompt).toContain('Available tools: read, grep, list_dir');
      expect(prompt).not.toContain('shell_exec');
      expect(prompt).not.toContain('spawn_agent');
    });

    it('says the session is read-only instead of giving editing rules', () => {
      expect(prompt).toContain('This session is read-only');
      expect(prompt).not.toContain('Before editing a file');
    });

    it('drops the tips that are about tools it does not have', () => {
      // "run it and read the error" contradicts a session with no shell_exec.
      expect(prompt).not.toContain('HANDY TIPS');
    });
  });

  it('mentions the current OS', () => {
    const prompt = buildSystemPrompt();
    const expected = process.platform === 'win32' ? 'Windows' : 'Linux';
    expect(prompt).toContain(expected);
  });
});
