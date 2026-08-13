import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';
import { offeredToolNames } from '../../src/agent/tools/tool-names.js';
import { projectRoot, setProjectRoot } from '../../src/agent/workspace.js';

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

  describe('project instructions', () => {
    // projectRoot is the repo itself under test, so these assert against the real
    // CLAUDE.md/AGENTS.md rather than a fixture.
    it('appends the instruction file when loadAgentsMd is set', () => {
      const prompt = buildSystemPrompt(true);
      expect(prompt).toContain('# Project Instructions (AGENTS.md)');
      expect(prompt).toContain('Freecode Agent Guide');
    });

    it('omits the instruction file by default', () => {
      expect(buildSystemPrompt()).not.toContain('# Project Instructions');
    });

    it('strips caller-only sections', () => {
      // The Subagents section tells a *caller* to shell out to `freecode -p` and to
      // report on delegating. A sub-agent cannot do either, and the report would
      // pollute the stdout the caller captures.
      const prompt = buildSystemPrompt(true);
      expect(prompt).not.toContain('caller-only:start');
      expect(prompt).not.toContain('## Subagents');
      expect(prompt).not.toContain('state whether you actually delegated');
      // Non-fenced guidance still has to survive the strip.
      expect(prompt).toContain('## Debugging and Verifying the UI');
      expect(prompt).toContain('## Git');
    });
  });

  describe('project instructions in an arbitrary repo', () => {
    const realRoot = projectRoot;
    let dir = '';

    afterEach(() => {
      setProjectRoot(realRoot);
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = '';
    });

    const withFiles = (files: Record<string, string>): string => {
      dir = mkdtempSync(join(tmpdir(), 'freecode-prompt-'));
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(join(dir, name), body);
      }
      setProjectRoot(dir);
      return buildSystemPrompt(true);
    };

    it('falls back to CLAUDE.md when the repo has no AGENTS.md', () => {
      const prompt = withFiles({ 'CLAUDE.md': 'house style: tabs' });
      expect(prompt).toContain('# Project Instructions (CLAUDE.md)');
      expect(prompt).toContain('house style: tabs');
    });

    it('prefers AGENTS.md when the repo has both', () => {
      const prompt = withFiles({ 'AGENTS.md': 'from agents', 'CLAUDE.md': 'from claude' });
      expect(prompt).toContain('# Project Instructions (AGENTS.md)');
      expect(prompt).not.toContain('from claude');
    });

    it('adds no header when the repo has neither', () => {
      expect(withFiles({})).not.toContain('# Project Instructions');
    });

    it('strips to end of file when a fence is never closed', () => {
      // Failing open would leak exactly what the fence exists to withhold.
      const prompt = withFiles({
        'AGENTS.md': 'keep me\n<!-- caller-only:start -->\nsecret\n',
      });
      expect(prompt).toContain('keep me');
      expect(prompt).not.toContain('secret');
    });

    it('adds no header when the file is entirely caller-only', () => {
      const prompt = withFiles({
        'AGENTS.md': '<!-- caller-only:start -->\nall of it\n<!-- caller-only:end -->\n',
      });
      expect(prompt).not.toContain('# Project Instructions');
    });
  });

  it('mentions the current OS', () => {
    const prompt = buildSystemPrompt();
    const expected = process.platform === 'win32' ? 'Windows' : 'Linux';
    expect(prompt).toContain(expected);
    expect(prompt).toContain('shell_exec OS: Linux (Docker)');
    expect(prompt).toContain('/work');
  });

  it('does not describe a shell in read-only mode', () => {
    const prompt = buildSystemPrompt(false, offeredToolNames({ readOnly: true }));
    expect(prompt).not.toContain('shell_exec OS:');
  });
});
