import { describe, it, expect } from 'vitest';
import {
  isReadOnlyTool,
  isToolName,
  isWriteTool,
  offeredToolNames,
  READ_ONLY_TOOL_NAMES,
  TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from '../../../src/agent/tools/tool-names.js';

// The agreement between these names and what createTools actually offers is pinned
// in tests/agent/tools/index.test.ts, where createTools lives. This file covers the
// partition itself.

describe('tool name partition', () => {
  it('splits every tool into exactly one half', () => {
    expect(TOOL_NAMES).toEqual([...READ_ONLY_TOOL_NAMES, ...WRITE_TOOL_NAMES]);
    for (const name of READ_ONLY_TOOL_NAMES) {
      expect(isReadOnlyTool(name)).toBe(true);
      expect(isWriteTool(name)).toBe(false);
    }
    for (const name of WRITE_TOOL_NAMES) {
      expect(isWriteTool(name)).toBe(true);
      expect(isReadOnlyTool(name)).toBe(false);
    }
  });

  it('rejects names that are not tools', () => {
    expect(isToolName('reader')).toBe(false);
    expect(isToolName('')).toBe(false);
    // spawn_agent is a real tool but not part of the read/write partition: it is
    // injected separately and only when a model-bound runner is supplied.
    expect(isToolName('spawn_agent')).toBe(false);
    expect(isReadOnlyTool('spawn_agent')).toBe(false);
    expect(isWriteTool('spawn_agent')).toBe(false);
  });
});

describe('offeredToolNames', () => {
  it('drops the write half and spawn_agent when read-only', () => {
    expect(offeredToolNames({ readOnly: true })).toEqual([...READ_ONLY_TOOL_NAMES]);
    // spawn_agent runs an LLM sub-turn, so read-only wins over asking for it.
    expect(offeredToolNames({ readOnly: true, spawnAgent: true })).toEqual([
      ...READ_ONLY_TOOL_NAMES,
    ]);
  });

  it('includes spawn_agent only when the caller supplies a runner', () => {
    expect(offeredToolNames({ spawnAgent: true })).toContain('spawn_agent');
    expect(offeredToolNames({ spawnAgent: false })).not.toContain('spawn_agent');
    expect(offeredToolNames({})).not.toContain('spawn_agent');
  });

  it('lists the full set in registry order when nothing is restricted', () => {
    expect(offeredToolNames({ spawnAgent: false })).toEqual([...TOOL_NAMES]);
  });
});
