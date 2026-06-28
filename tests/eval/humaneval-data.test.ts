import { describe, expect, it, vi, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { resolve, dirname, join as pathJoin } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

// ── Hoisted stores ────────────────────────────────────────────────────────────

const { mocks } = vi.hoisted(() => {
  const mocks = {
    // Per-test https.get implementation; null → request hangs
    httpsGetImpl: null as null | ((url: string, cb: (res: unknown) => void) => { on: (ev: string, cb: (e: Error) => void) => void }),
    // Per-test createWriteStream implementation; null → use real fs
    createWriteStreamImpl: null as null | ((path: string) => unknown),
    // If set, readFileSync throws this value instead of reading the file
    readFileSyncThrow: null as unknown,
  };
  return { mocks };
});

// ── Module mocks (must be top-level, before any imports from those modules) ───

// Partial mock of 'fs': pass through all real implementations except createWriteStream
// and readFileSync, which need to be controllable in specific tests.
vi.mock('fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    createWriteStream: vi.fn((p: string) => {
      if (mocks.createWriteStreamImpl) return mocks.createWriteStreamImpl(p);
      return actual.createWriteStream(p);
    }),
    readFileSync: vi.fn((p: unknown, encoding?: unknown) => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (mocks.readFileSyncThrow !== null) throw mocks.readFileSyncThrow;
      return actual.readFileSync(p as string, encoding as BufferEncoding);
    }),
  };
});

// Mock the https module so downloadFile can be tested without real network calls.
vi.mock('https', () => ({
  default: {
    get: vi.fn((url: string, cb: (res: unknown) => void) => {
      if (mocks.httpsGetImpl) return mocks.httpsGetImpl(url, cb);
      // Default: do nothing (request hangs)
      return { on: vi.fn() };
    }),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  humanEvalDatasetPath,
  ensureHumanEvalDataset,
  loadHumanEvalProblems,
} from '../../src/eval/humaneval-data.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_GZ = resolve(_dirname, '..', 'scenarios', 'humaneval-mini.jsonl.gz');
const FIXTURE_EXAMPLE = resolve(_dirname, '..', 'scenarios', 'humaneval-example.jsonl');

// ── humanEvalDatasetPath ──────────────────────────────────────────────────────

describe('humanEvalDatasetPath', () => {
  afterEach(() => {
    delete process.env['HUMANEVAL_DATA'];
  });

  it('returns env var when HUMANEVAL_DATA is set', () => {
    process.env['HUMANEVAL_DATA'] = '/custom/path/HumanEval.jsonl.gz';
    expect(humanEvalDatasetPath()).toBe('/custom/path/HumanEval.jsonl.gz');
  });

  it('returns default path when HUMANEVAL_DATA is not set', () => {
    delete process.env['HUMANEVAL_DATA'];
    const result = humanEvalDatasetPath();
    expect(result).toContain('HumanEval.jsonl.gz');
    expect(result).toContain('humaneval');
  });
});

// ── ensureHumanEvalDataset ────────────────────────────────────────────────────

describe('ensureHumanEvalDataset', () => {
  afterEach(() => {
    delete process.env['HUMANEVAL_DATA'];
    vi.restoreAllMocks();
  });

  it('returns true without calling downloadFn when file already exists', async () => {
    process.env['HUMANEVAL_DATA'] = FIXTURE_GZ;
    const downloadFn = vi.fn();
    const result = await ensureHumanEvalDataset(downloadFn);
    expect(result).toBe(true);
    expect(downloadFn).not.toHaveBeenCalled();
  });

  it('calls downloadFn and returns true when file is missing and download succeeds', async () => {
    process.env['HUMANEVAL_DATA'] = '/tmp/nonexistent-humaneval-missing.jsonl.gz';
    const downloadFn = vi.fn().mockResolvedValue(undefined);
    const logged: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: unknown) => {
      logged.push(String(data));
      return true;
    });
    const result = await ensureHumanEvalDataset(downloadFn);
    expect(result).toBe(true);
    expect(downloadFn).toHaveBeenCalledWith(
      expect.stringContaining('HumanEval.jsonl.gz'),
      '/tmp/nonexistent-humaneval-missing.jsonl.gz',
    );
    expect(logged.some(l => l.includes('done'))).toBe(true);
  });

  it('returns false when file is missing and download fails', async () => {
    process.env['HUMANEVAL_DATA'] = '/tmp/nonexistent-humaneval-missing2.jsonl.gz';
    const downloadFn = vi.fn().mockRejectedValue(new Error('network error'));
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const result = await ensureHumanEvalDataset(downloadFn);
    expect(result).toBe(false);
    expect(logged.some(l => l.includes('network error'))).toBe(true);
  });

  it('uses String(err) when download rejects with a non-Error value', async () => {
    process.env['HUMANEVAL_DATA'] = '/tmp/nonexistent-humaneval-missing3.jsonl.gz';
    const downloadFn = vi.fn().mockRejectedValue('string rejection');
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const result = await ensureHumanEvalDataset(downloadFn);
    expect(result).toBe(false);
    expect(logged.some(l => l.includes('string rejection'))).toBe(true);
  });
});

// ── loadHumanEvalProblems ─────────────────────────────────────────────────────

describe('loadHumanEvalProblems', () => {
  afterEach(() => {
    delete process.env['HUMANEVAL_DATA'];
    delete process.env['HUMANEVAL_EXAMPLE_DATA'];
    vi.restoreAllMocks();
  });

  it('returns problems from gzip fixture with example prepended', () => {
    process.env['HUMANEVAL_DATA'] = FIXTURE_GZ;
    process.env['HUMANEVAL_EXAMPLE_DATA'] = FIXTURE_EXAMPLE;
    const problems = loadHumanEvalProblems();
    expect(problems).not.toBeNull();
    expect(Array.isArray(problems)).toBe(true);
    // example.jsonl has test/0, mini gz has HumanEval/0
    expect(problems!.length).toBeGreaterThanOrEqual(1);
    // Each problem has required fields
    for (const p of problems!) {
      expect(p).toHaveProperty('task_id');
      expect(p).toHaveProperty('prompt');
      expect(p).toHaveProperty('canonical_solution');
      expect(p).toHaveProperty('test');
      expect(p).toHaveProperty('entry_point');
    }
  });

  it('returns problems from gzip fixture when no example file exists', () => {
    process.env['HUMANEVAL_DATA'] = FIXTURE_GZ;
    process.env['HUMANEVAL_EXAMPLE_DATA'] = '/tmp/nonexistent-example.jsonl';
    const problems = loadHumanEvalProblems();
    expect(problems).not.toBeNull();
    expect(problems!.length).toBeGreaterThanOrEqual(1);
    // Without example file, first problem is from the gz
    expect(problems![0].task_id).toBe('HumanEval/0');
  });

  it('returns null and logs an error when dataset file is missing', () => {
    process.env['HUMANEVAL_DATA'] = '/tmp/humaneval-does-not-exist.jsonl.gz';
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    const problems = loadHumanEvalProblems();
    expect(problems).toBeNull();
    expect(logged.some(l => l.includes('Failed to load'))).toBe(true);
  });

  it('loads from HUMANEVAL_DATA_DEFAULT when env var is not set', () => {
    // Neither env var is set → readProblems falls through to the default bundled paths.
    // evals/humaneval/data/HumanEval.jsonl.gz exists in this repo.
    delete process.env['HUMANEVAL_DATA'];
    delete process.env['HUMANEVAL_EXAMPLE_DATA'];
    const problems = loadHumanEvalProblems();
    expect(problems).not.toBeNull();
    expect(problems!.length).toBeGreaterThanOrEqual(164);
  });

  it('uses String(err) when a non-Error value is thrown during load', () => {
    process.env['HUMANEVAL_DATA'] = FIXTURE_GZ;
    mocks.readFileSyncThrow = 'non-error string thrown';
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    const problems = loadHumanEvalProblems();
    expect(problems).toBeNull();
    expect(logged.some(l => l.includes('non-error string thrown'))).toBe(true);
    mocks.readFileSyncThrow = null;
  });
});

// ── downloadFile ──────────────────────────────────────────────────────────────

describe('downloadFile', () => {
  const DOWNLOAD_DEST = pathJoin(tmpdir(), 'humaneval-dl-test', 'test.jsonl.gz');

  function makeFakeStream() {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const stream = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] ??= [];
        handlers[event].push(cb);
        return stream;
      }),
      pipe: vi.fn(() => {
        // Return a fake stream for chaining
        return stream;
      }),
      close: vi.fn((cb: () => void) => { cb(); }),
    };
    return { stream, handlers };
  }

  function makeResponse(statusCode: number, opts: { location?: string } = {}) {
    const { stream } = makeFakeStream();
    return {
      statusCode,
      headers: { location: opts.location },
      pipe: vi.fn().mockReturnValue(stream),
    };
  }

  afterEach(() => {
    mocks.httpsGetImpl = null;
    mocks.createWriteStreamImpl = null;
    try { rmSync(pathJoin(tmpdir(), 'humaneval-dl-test'), { recursive: true, force: true }); } catch { /* ignore */ }
    vi.clearAllMocks();
  });

  it('resolves when status 200 and file finishes writing', async () => {
    const { stream, handlers } = makeFakeStream();
    mocks.createWriteStreamImpl = () => stream;

    mocks.httpsGetImpl = (_url, cb) => {
      const res = makeResponse(200);
      // Simulate: pipe is called on the file, then 'finish' fires
      res.pipe = vi.fn(() => {
        // After piping, trigger 'finish' on the file stream
        setTimeout(() => {
          handlers['finish']?.forEach(h => h());
        }, 0);
        return stream;
      });
      cb(res);
      return { on: vi.fn() };
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).resolves.toBeUndefined();
  });

  it('rejects with HTTP error when status is not 200/301/302', async () => {
    const { stream } = makeFakeStream();
    mocks.createWriteStreamImpl = () => stream;

    mocks.httpsGetImpl = (_url, cb) => {
      cb(makeResponse(404));
      return { on: vi.fn() };
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).rejects.toThrow('HTTP 404');
  });

  it('follows 301 redirect then downloads from redirect URL', async () => {
    const { stream, handlers } = makeFakeStream();
    mocks.createWriteStreamImpl = () => stream;

    const calls: string[] = [];
    mocks.httpsGetImpl = (url, cb) => {
      calls.push(url);
      if (url === 'https://example.com/data.gz') {
        // First call: 301 redirect to new URL
        cb(makeResponse(301, { location: 'https://cdn.example.com/data.gz' }));
      } else {
        // Second call (redirect target): 200 success
        const res = makeResponse(200);
        res.pipe = vi.fn(() => {
          setTimeout(() => { handlers['finish']?.forEach(h => h()); }, 0);
          return stream;
        });
        cb(res);
      }
      return { on: vi.fn() };
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).resolves.toBeUndefined();

    expect(calls).toEqual(['https://example.com/data.gz', 'https://cdn.example.com/data.gz']);
  });

  it('follows 302 redirect', async () => {
    const { stream, handlers } = makeFakeStream();
    mocks.createWriteStreamImpl = () => stream;

    const calls: string[] = [];
    mocks.httpsGetImpl = (url, cb) => {
      calls.push(url);
      if (url === 'https://example.com/data.gz') {
        cb(makeResponse(302, { location: 'https://cdn2.example.com/data.gz' }));
      } else {
        const res = makeResponse(200);
        res.pipe = vi.fn(() => {
          setTimeout(() => { handlers['finish']?.forEach(h => h()); }, 0);
          return stream;
        });
        cb(res);
      }
      return { on: vi.fn() };
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).resolves.toBeUndefined();

    expect(calls).toContain('https://cdn2.example.com/data.gz');
  });

  it('rejects when https.get emits an error', async () => {
    const { stream } = makeFakeStream();
    mocks.createWriteStreamImpl = () => stream;

    mocks.httpsGetImpl = (_url, _cb) => {
      const req = {
        on: vi.fn((event: string, cb: (e: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('connection refused')), 0);
          }
          return req;
        }),
      };
      return req;
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).rejects.toThrow('connection refused');
  });

  it('rejects when file stream emits an error', async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const stream = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] ??= [];
        handlers[event].push(cb);
        return stream;
      }),
      pipe: vi.fn(() => {
        setTimeout(() => { handlers['error']?.forEach(h => h(new Error('disk full'))); }, 0);
        return stream;
      }),
      close: vi.fn(),
    };
    mocks.createWriteStreamImpl = () => stream;

    mocks.httpsGetImpl = (_url, cb) => {
      const res = makeResponse(200);
      res.pipe = stream.pipe;
      cb(res);
      return { on: vi.fn() };
    };

    await expect(
      (await import('../../src/eval/humaneval-data.js')).downloadFile('https://example.com/data.gz', DOWNLOAD_DEST)
    ).rejects.toThrow('disk full');
  });
});
