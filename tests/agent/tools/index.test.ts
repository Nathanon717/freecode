import { describe, it, expect } from 'vitest';
// Imported statically (not via per-test `await import`) so the one-time cold TS-transform
// of this heavy module graph runs during collection, not against the per-test timeout.
import {
  createTools,
  READ_ONLY_TOOL_DEFS,
  WRITE_TOOL_DEFS,
} from '../../../src/agent/tools/index.js';
import {
  offeredToolNames,
  READ_ONLY_TOOL_NAMES,
  TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from '../../../src/agent/tools/tool-names.js';

// The wrapper stack each of these tools is built from is covered in wrappers.test.ts.

// tool-names.ts declares the read-only/write partition with no imports, so the
// interactive boot path and the hand-typed parser can use it without pulling in
// the `ai` SDK. That split is only safe while the names and the tool maps agree.
describe('read-only / write partition', () => {
  it('keeps the name lists and the tool maps in step', () => {
    expect(Object.keys(READ_ONLY_TOOL_DEFS)).toEqual([...READ_ONLY_TOOL_NAMES]);
    expect(Object.keys(WRITE_TOOL_DEFS)).toEqual([...WRITE_TOOL_NAMES]);
  });

  it('partitions every tool createTools offers, spawn_agent aside', () => {
    const offered = Object.keys(createTools(() => Promise.resolve(true)));
    expect(offered).toEqual([...TOOL_NAMES]);
  });

  it('offers the read-only half and no spawn_agent when readOnly is set', () => {
    const offered = Object.keys(
      createTools(() => Promise.resolve(true), false, false, true, () =>
        Promise.resolve('never runs'),
      ),
    );
    expect(offered).toEqual([...READ_ONLY_TOOL_NAMES]);
  });

  // The system prompt states the tool list from offeredToolNames rather than from
  // the registry (tool-names.ts explains why), so the two must agree exactly — a
  // prompt advertising an absent tool sends the model calling something that is not
  // there.
  it.each([
    { readOnly: false, spawnAgent: false },
    { readOnly: false, spawnAgent: true },
    { readOnly: true, spawnAgent: false },
    { readOnly: true, spawnAgent: true },
  ])('matches offeredToolNames for %j', (flags) => {
    const offered = Object.keys(
      createTools(
        () => Promise.resolve(true),
        false,
        false,
        flags.readOnly,
        flags.spawnAgent ? () => Promise.resolve('findings') : undefined,
      ),
    );
    expect(offered).toEqual([...offeredToolNames(flags)]);
  });
});
