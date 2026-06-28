// check-tests: orphan
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return { ...(actual as Record<string, unknown>), execFile: vi.fn() };
});

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return { ...(actual as Record<string, unknown>), stat: vi.fn() };
});

import { execFile } from 'child_process';
import { stat } from 'fs/promises';
import { grepTool } from '../../../src/agent/tools/grep.js';

type Cb = (err: unknown, val?: unknown) => void;

function mockExecFileSuccess(stdout: string) {
  vi.mocked(execFile).mockImplementation((_f, _a, _o, cb) => {
    (cb as Cb)(null, { stdout });
  });
}

function mockExecFileError(err: unknown) {
  vi.mocked(execFile).mockImplementation((_f, _a, _o, cb) => {
    (cb as Cb)(err);
  });
}

describe('grep tool – mocked edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── exit-code paths ────────────────────────────────────────────────────────

  it('handles rg exit code 2 with partial stdout (line 27)', async () => {
    mockExecFileError(Object.assign(new Error('exit 2'), { code: 2, stdout: 'src/index.ts:1:needle' }));
    vi.mocked(stat).mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('src/index.ts');
  });

  it('handles rg exit code 2 with no stdout (?? empty-string branch, line 27)', async () => {
    mockExecFileError(Object.assign(new Error('exit 2'), { code: 2, stdout: undefined }));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toBe('No matches found');
  });

  it('propagates rg Error through execute catch (lines 28 + 118, instanceof branch)', async () => {
    mockExecFileError(Object.assign(new Error('rg internal error'), { code: 3 }));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Error searching:');
    expect(result).toContain('rg internal error');
  });

  it('propagates non-Error rg failure through execute catch (line 118, String() branch)', async () => {
    mockExecFileError({ code: 3 });

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toMatch(/^Error searching:/);
  });

  // ── stat failure ───────────────────────────────────────────────────────────

  it('falls back to mtime 0 when stat throws (line 61)', async () => {
    mockExecFileSuccess('src/index.ts:1:needle');
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('src/index.ts');
  });

  // ── truncation ─────────────────────────────────────────────────────────────

  it('truncates results and shows count when more than 100 matches (lines 89-90)', async () => {
    const lines = Array.from({ length: 101 }, (_, i) => `src/index.ts:${i + 1}:needle`).join('\n');
    mockExecFileSuccess(lines);
    vi.mocked(stat).mockResolvedValue({ mtimeMs: Date.now() } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('101 matches');
    expect(result).toContain('(Results truncated:');
    expect(result).toContain('showing 100 of 101 matches');
  });

  // ── include param (line 17) ────────────────────────────────────────────────

  it('forwards include glob to rg when provided (line 17)', async () => {
    mockExecFileSuccess('src/index.ts:1:needle');
    vi.mocked(stat).mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'needle', path: '.', include: '*.ts' });
    expect(result).toContain('Found');
  });

  // ── rg output parse edge cases (lines 41-50) ──────────────────────────────

  it('skips malformed rg output lines and keeps valid ones (lines 42, 44, 48)', async () => {
    const mixed = [
      'no-colon-at-all',        // colonIdx < 0  → skip
      'one:colon',              // afterFile < 0 → skip
      'src/a.ts:abc:text',      // parseInt('abc') = NaN → skip
      'src/index.ts:1:needle',  // valid
    ].join('\n');
    mockExecFileSuccess(mixed);
    vi.mocked(stat).mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found 1 matches');
    expect(result).toContain('src/index.ts');
  });

  // ── all lines malformed → parsed empty (line 50) ─────────────────────────

  it('returns "No matches found" when all rg output lines are unparseable (line 50)', async () => {
    mockExecFileSuccess('no-colon-at-all\none:colon');

    const result = await grepTool.execute({ pattern: 'anything', path: '.' });
    expect(result).toBe('No matches found');
  });

  // ── long-line truncation (line 84) ────────────────────────────────────────

  it('truncates individual match text longer than 2000 chars (line 84)', async () => {
    const longText = 'x'.repeat(2001);
    mockExecFileSuccess(`src/index.ts:1:${longText}`);
    vi.mocked(stat).mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'x', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('...');
    expect(result).not.toContain(longText);
  });

  // ── multi-file blank-line separator (line 81) ──────────────────────────────

  it('inserts blank line between file groups in output (line 81)', async () => {
    const output = 'src/a.ts:1:needle\nsrc/b.ts:2:needle';
    mockExecFileSuccess(output);
    vi.mocked(stat)
      .mockResolvedValueOnce({ mtimeMs: 2000 } as Awaited<ReturnType<typeof stat>>)
      .mockResolvedValueOnce({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found 2 matches');
    expect(result).toContain('src/a.ts');
    expect(result).toContain('src/b.ts');
    // blank line separator between the two file sections
    expect(result).toContain('\n\n');
  });
});
