import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
// Imported statically (not via per-test `await import`) so the one-time cold TS-transform
// of this heavy module graph runs during collection, not against the per-test timeout.
import { createTools } from '../../../src/agent/tools/index.js';
import { setProjectRoot } from '../../../src/agent/workspace.js';

describe('tool confirmation', () => {
  it('executes an approved tool call', async () => {
    const tools = createTools(() => Promise.resolve(true));

    const result = await tools.read.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('"name": "freecode"');
  });

  it('denies a rejected tool call before execution', async () => {
    const tools = createTools(() => Promise.resolve(false));

    const result = await tools.read.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('Tool call denied by user');
    expect(result).toContain('read');
  });

  it('includes user feedback when a denied tool call provides it', async () => {
    const tools = createTools(() => Promise.resolve({
      approved: false,
      message: 'Do not read that file; summarize the current directory instead.',
    }));

    const result = await tools.read.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('Tool call denied by user');
    expect(result).toContain('User input after denial');
    expect(result).toContain('summarize the current directory instead');
  });

  it('flows a diff preview to the approval prompt before an edit executes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'freecode-edit-preview-'));
    setProjectRoot(tempRoot);

    try {
      await writeFile(join(tempRoot, 'note.txt'), 'alpha\nbeta\ngamma\n');

      let previewedForEdit: boolean | undefined;
      const tools = createTools((preview) => {
        if (preview.name === 'edit') previewedForEdit = preview.previewedContent;
        return Promise.resolve(true);
      });

      // Read first so the edit is allowed to apply once approved.
      await tools.read.execute?.({ path: 'note.txt' }, {});
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result = (await tools.edit.execute?.(
        { path: 'note.txt', old_text: 'beta', new_text: 'BETA' },
        {},
      )) as string | undefined;

      // The confirmation handler saw a content preview already on screen — the
      // diff was flowed before it was asked to approve, just like create.
      expect(previewedForEdit).toBe(true);
      expect(result).toContain('Edited');
    } finally {
      setProjectRoot(process.cwd());
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('runs concurrent tool calls in request order', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'freecode-tool-order-'));
    setProjectRoot(tempRoot);

    try {
      const tools = createTools(async (preview) => {
        if (preview.name === 'create') {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        return true;
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const [, readResult] = (await Promise.all([tools.create.execute?.({ path: 'output.txt', content: 'queued content' }, {}), tools.read.execute?.({ path: 'output.txt' }, {})])) as [unknown, unknown];

      expect(readResult).toContain('queued content');
    } finally {
      setProjectRoot(process.cwd());
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
