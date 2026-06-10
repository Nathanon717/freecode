import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('lists all available tools', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('read_file');
    expect(prompt).toContain('write_file');
    expect(prompt).toContain('edit_file');
    expect(prompt).toContain('grep');
    expect(prompt).toContain('shell_exec');
    expect(prompt).toContain('list_dir');
  });

  it('mentions the current OS', () => {
    const prompt = buildSystemPrompt();
    const expected = process.platform === 'win32' ? 'Windows' : 'Linux';
    expect(prompt).toContain(expected);
  });
});
