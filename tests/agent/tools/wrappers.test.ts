import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
// Imported statically (not via per-test `await import`) so the one-time cold TS-transform
// of this heavy module graph runs during collection, not against the per-test timeout.
import { createTools } from '../../../src/agent/tools/index.js';
import { isTurnStoppedError } from '../../../src/util/errors.js';
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

      const [, readResult] = (await Promise.all([tools.create.execute?.({ path: 'output.txt', content: 'queued content' }, {}), tools.read.execute?.({ path: 'output.txt' }, {})])) as [unknown, unknown];

      expect(readResult).toContain('queued content');
    } finally {
      setProjectRoot(process.cwd());
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

// Esc denies the call AND ends the turn. The denial is an ordinary result; what
// stops the turn is withTurnStop rejecting once that result has rendered, which
// is the only thing that keeps the AI SDK from taking another step. See
// docs/bug log/05-08-2026b.md.
describe('turn stop (stopTurn)', () => {
  it('reports the rendered denial as the rejection, so it can be re-paired into history', async () => {
    const tools = createTools(() => Promise.resolve({ approved: false, stopTurn: true }));

    const error = await tools.read.execute?.({ path: 'package.json' }, {}).then(
      () => null,
      (err: unknown) => err,
    );

    expect(isTurnStoppedError(error)).toBe(true);
    // The exact string the transcript printed — not an error message.
    expect((error as { denialResult: string }).denialResult).toContain('Tool call denied by user');
    expect((error as { denialResult: string }).denialResult).toContain('read');
    // And says so, factually — the model reads this at the start of its NEXT
    // turn, where a bare denial would read as "not that call" and invite a retry.
    expect((error as { denialResult: string }).denialResult).toContain(
      'The user pressed Esc to stop the turn here.',
    );
  });

  it('refuses a sibling call queued behind the stopped one without prompting it', async () => {
    const asked: string[] = [];
    const tools = createTools((preview) => {
      asked.push(preview.name);
      return Promise.resolve({ approved: false, stopTurn: true });
    });

    await tools.read.execute?.({ path: 'package.json' }, {}).then(
      () => null,
      () => null,
    );
    const second = await tools.list_dir.execute?.({ path: '.' }, {}).then(
      () => null,
      (err: unknown) => err,
    );

    expect(isTurnStoppedError(second)).toBe(true);
    // The second call never reached the approval callback.
    expect(asked).toEqual(['read']);
  });

  it('leaves a later turn unaffected: the stop state is per createTools() call', async () => {
    const stopped = createTools(() => Promise.resolve({ approved: false, stopTurn: true }));
    await stopped.read.execute?.({ path: 'package.json' }, {}).then(
      () => null,
      () => null,
    );

    const fresh = createTools(() => Promise.resolve(true));
    const result = (await fresh.read.execute?.({ path: 'package.json' }, {})) as string | undefined;

    expect(result).toContain('"name": "freecode"');
  });

  it('does not stop the turn for a plain denial', async () => {
    const tools = createTools(() => Promise.resolve({ approved: false }));

    const first = (await tools.read.execute?.({ path: 'package.json' }, {})) as string | undefined;
    const second = (await tools.read.execute?.({ path: 'package.json' }, {})) as string | undefined;

    expect(first).toContain('Tool call denied by user');
    expect(first).not.toContain('Esc');
    // Still prompted and still denied normally — no stop leaked between calls.
    expect(second).toContain('Tool call denied by user');
  });
});
