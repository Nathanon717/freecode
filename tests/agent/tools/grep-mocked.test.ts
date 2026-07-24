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

/** The argv rg was last invoked with, for asserting flag construction. */
function captureArgs(): string[] {
  const call = vi.mocked(execFile).mock.calls.at(-1);
  return (call?.[1] as string[]) ?? [];
}

/** Minimal fs.Stats stand-in: grep reads mtimeMs, plus isDirectory() to resolve its search root. */
function statResult(mtimeMs: number) {
  return { mtimeMs, isDirectory: () => true } as unknown as Awaited<ReturnType<typeof stat>>;
}

function mockExecFileError(err: unknown) {
  vi.mocked(execFile).mockImplementation((_f, _a, _o, cb) => {
    (cb as Cb)(err);
  });
}

describe('grep tool – mocked edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // grep stats its search root before running rg, to decide whether the path names a
    // directory or a single file. Tests that care about mtime ordering override this.
    vi.mocked(stat).mockResolvedValue(statResult(0));
  });

  // ── exit-code paths ────────────────────────────────────────────────────────

  it('handles rg exit code 2 with partial stdout (line 27)', async () => {
    mockExecFileError(Object.assign(new Error('exit 2'), { code: 2, stdout: 'src/index.ts\x001:needle' }));
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('src/index.ts');
  });

  it('handles rg exit code 2 with no stdout (?? empty-string branch, line 27)', async () => {
    mockExecFileError(Object.assign(new Error('exit 2'), { code: 2, stdout: undefined }));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toBe('No matches found');
  });

  it('reports a timeout instead of an opaque "Command failed" when rg is killed', async () => {
    // Node's timeout kill: signalled, so `code` is null rather than an rg exit code.
    mockExecFileError(
      Object.assign(new Error('Command failed: rg.exe --no-config -n ...'), {
        code: null,
        signal: 'SIGTERM',
        killed: true,
      }),
    );

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('timed out after 10s');
    expect(result).not.toContain('Command failed');
  });

  it('reports an output-size limit instead of an opaque error on maxBuffer overflow', async () => {
    mockExecFileError(
      Object.assign(new Error('stdout maxBuffer length exceeded'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      }),
    );

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('more than 10MB of output');
    expect(result).not.toContain('maxBuffer');
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
    mockExecFileSuccess('src/index.ts\x001:needle');
    // Only the result file's stat fails (it was deleted between the search and the sort);
    // the search root itself still resolves.
    vi.mocked(stat).mockImplementation((p) =>
      String(p).endsWith('index.ts')
        ? Promise.reject(new Error('ENOENT'))
        : Promise.resolve(statResult(1000)),
    );

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('src/index.ts');
  });

  // ── truncation ─────────────────────────────────────────────────────────────

  it('truncates results and shows count when more than 100 matches (lines 89-90)', async () => {
    const lines = Array.from({ length: 101 }, (_, i) => `src/index.ts\x00${i + 1}:needle`).join('\n');
    mockExecFileSuccess(lines);
    vi.mocked(stat).mockResolvedValue(statResult(Date.now()));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('101 matches');
    expect(result).toContain('(Results truncated:');
    expect(result).toContain('showing 100 of 101 matches');
  });

  // ── include param (line 17) ────────────────────────────────────────────────

  it('forwards include glob to rg when provided (line 17)', async () => {
    mockExecFileSuccess('src/index.ts\x001:needle');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', include: '*.ts' });
    expect(result).toContain('Found');
  });

  // ── rg output parse edge cases (lines 41-50) ──────────────────────────────

  it('skips malformed rg output lines and keeps valid ones', async () => {
    const mixed = [
      'no-nul-at-all',              // no NUL separator → skip
      '--',                         // rg context-group divider → skip
      'src/a.ts\x00abc:text',       // line number not numeric → skip
      'src/index.ts\x001:needle',   // valid
    ].join('\n');
    mockExecFileSuccess(mixed);
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found 1 matches');
    expect(result).toContain('src/index.ts');
  });

  // ── all lines malformed → parsed empty (line 50) ─────────────────────────

  it('returns "No matches found" when all rg output lines are unparseable', async () => {
    mockExecFileSuccess('no-nul-at-all\nalso:no:nul');

    const result = await grepTool.execute({ pattern: 'anything', path: '.' });
    expect(result).toBe('No matches found');
  });

  // ── long-line truncation (line 84) ────────────────────────────────────────

  it('truncates individual match text longer than 2000 chars (line 84)', async () => {
    const longText = 'x'.repeat(2001);
    mockExecFileSuccess(`src/index.ts\x001:${longText}`);
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'x', path: '.' });
    expect(result).toContain('Found');
    expect(result).toContain('...');
    expect(result).not.toContain(longText);
  });

  // ── multi-file blank-line separator (line 81) ──────────────────────────────

  it('inserts blank line between file groups in output (line 81)', async () => {
    // b.ts is the newer file, so recency sorting must hoist it above a.ts.
    const output = 'src/a.ts\x001:needle\nsrc/b.ts\x002:needle';
    mockExecFileSuccess(output);
    vi.mocked(stat).mockImplementation((p) =>
      Promise.resolve(statResult(String(p).endsWith('b.ts') ? 2000 : 1000)),
    );

    const result = await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(result).toContain('Found 2 matches in 2 files');
    expect(result.indexOf('src/b.ts')).toBeLessThan(result.indexOf('src/a.ts'));
    // blank line separator between the two file sections
    expect(result).toContain('\n\n');
  });

  // ── exit 2 as a real failure, not an empty result ─────────────────────────

  it('surfaces a usage error (bad regex) instead of reporting "No matches found"', async () => {
    // --no-messages silences unreadable-path warnings but not regex/usage errors, so
    // exit 2 with stderr and no stdout means the search never ran.
    mockExecFileError(
      Object.assign(new Error('exit 2'), {
        code: 2,
        stdout: '',
        stderr: 'rg: regex parse error:\n    (?:foo(\nerror: unclosed group',
      }),
    );

    const result = await grepTool.execute({ pattern: 'foo(', path: '.' });
    expect(result).toContain('Search failed:');
    expect(result).toContain('unclosed group');
    expect(result).not.toContain('No matches found');
  });

  // ── output modes ──────────────────────────────────────────────────────────

  it('lists paths only in files_with_matches mode', async () => {
    // -l --null emits NUL-terminated paths with no line breaks.
    mockExecFileSuccess('src/a.ts\x00src/b.ts\x00');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({
      pattern: 'needle',
      path: '.',
      output_mode: 'files_with_matches',
    });
    expect(result).toContain('Found 2 files with matches');
    expect(result).toContain('src/a.ts');
    expect(result).not.toContain('Line ');
    expect(captureArgs()).toContain('--files-with-matches');
  });

  it('reports per-file tallies and a grand total in count mode', async () => {
    mockExecFileSuccess('src/a.ts\x003\nsrc/b.ts\x002');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', output_mode: 'count' });
    expect(result).toContain('Found 5 matches in 2 files');
    expect(result).toContain('src/a.ts: 3');
    expect(captureArgs()).toContain('--count');
  });

  // ── context lines ─────────────────────────────────────────────────────────

  it('renders context rows with a "-" separator and matches with ":"', async () => {
    mockExecFileSuccess(['src/a.ts\x001-before', 'src/a.ts\x002:needle', 'src/a.ts\x003-after'].join('\n'));
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', context_lines: 1 });
    // Only the match counts toward the total; context is extra detail, not a result.
    expect(result).toContain('Found 1 matches in 1 file');
    expect(result).toContain('  Line 1- before');
    expect(result).toContain('  Line 2: needle');
    expect(captureArgs()).toContain('--context=1');
  });

  it('marks a gap between non-adjacent context groups within one file', async () => {
    mockExecFileSuccess(['src/a.ts\x002:needle', 'src/a.ts\x009:needle'].join('\n'));
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', context_lines: 1 });
    expect(result).toContain('  --');
  });

  it('clamps context_lines to the 0-20 range', async () => {
    mockExecFileSuccess('src/a.ts\x001:needle');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    await grepTool.execute({ pattern: 'needle', path: '.', context_lines: 999 });
    expect(captureArgs()).toContain('--context=20');
  });

  it('omits --context entirely when no context was requested', async () => {
    mockExecFileSuccess('src/a.ts\x001:needle');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    await grepTool.execute({ pattern: 'needle', path: '.' });
    expect(captureArgs().some((a) => a.startsWith('--context'))).toBe(false);
  });

  // ── flag forwarding ───────────────────────────────────────────────────────

  it('forwards case_insensitive and multiline as rg flags', async () => {
    mockExecFileSuccess('src/a.ts\x001:needle');
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    await grepTool.execute({ pattern: 'needle', path: '.', case_insensitive: true, multiline: true });
    const args = captureArgs();
    expect(args).toContain('-i');
    expect(args).toContain('--multiline');
    expect(args).toContain('--multiline-dotall');
  });

  // ── head_limit ────────────────────────────────────────────────────────────

  it('honors head_limit below the default result cap', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `src/a.ts\x00${i + 1}:needle`).join('\n');
    mockExecFileSuccess(lines);
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', head_limit: 5 });
    expect(result).toContain('showing first 5');
    expect(result).toContain('showing 5 of 20 matches');
    expect(result).not.toContain('Line 6:');
  });

  it('counts files across the whole result, not just the rows that survived the cap', async () => {
    // 3 files match; only the first is reachable within head_limit. The header must not
    // pair a repo-wide match count with a post-cap file count.
    const lines = ['a', 'b', 'c']
      .flatMap((f) => Array.from({ length: 4 }, (_, i) => `src/${f}.ts\x00${i + 1}:needle`))
      .join('\n');
    mockExecFileSuccess(lines);
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', head_limit: 2 });
    expect(result).toContain('Found 12 matches in 3 files');
  });

  it('clamps head_limit to the 1000-result ceiling', async () => {
    const lines = Array.from({ length: 1001 }, (_, i) => `src/a.ts\x00${i + 1}:needle`).join('\n');
    mockExecFileSuccess(lines);
    vi.mocked(stat).mockResolvedValue(statResult(1000));

    const result = await grepTool.execute({ pattern: 'needle', path: '.', head_limit: 99999 });
    expect(result).toContain('showing 1000 of 1001 matches');
  });
});
