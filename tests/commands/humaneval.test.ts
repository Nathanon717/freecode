import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Interface } from 'readline';

const fakeRl = { pause: vi.fn(), resume: vi.fn(), question: vi.fn() } as unknown as Interface;

// ── Module mocks ─────────────────────────────────────────────────────────────

const { pickerStore } = vi.hoisted(() => {
  const pickerStore = {
    capturedOpts: null as {
      render: () => string[];
      onKey: (key: string, redraw: () => void, close: (v: unknown) => void) => void;
    } | null,
  };
  return { pickerStore };
});

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawPicker: vi.fn().mockImplementation((_rl: unknown, opts: unknown) => {
    pickerStore.capturedOpts = opts as typeof pickerStore.capturedOpts;
    return Promise.resolve(null); // Default: picker closed with null (Escape)
  }),
  countWrappedLines: vi.fn().mockReturnValue(1),
  resetStdinConsoleMode: vi.fn(),
  resetTerminalPrivateModes: vi.fn(),
}));

vi.mock('../../src/cli/terminal-ui.js', () => ({
  isBottomUIActive: vi.fn().mockReturnValue(false),
  setModelStatus: vi.fn(),
  setTokenCount: vi.fn(),
  setupBottomUI: vi.fn(),
  teardownBottomUI: vi.fn(),
}));

vi.mock('../../src/cli/banner.js', () => ({
  redrawBanner: vi.fn(),
}));

vi.mock('../../src/providers/model-store.js', () => ({
  appendEvalRun: vi.fn(),
  getHumanEvalResults: vi.fn().mockReturnValue({}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProblem(overrides?: Partial<{
  task_id: string; prompt: string; canonical_solution: string; test: string; entry_point: string;
}>) {
  return {
    task_id: 'test/0',
    prompt: 'def add(a, b):\n    pass\n',
    canonical_solution: '    return a + b\n',
    test: 'def check(c):\n    assert c(1, 2) == 3\n',
    entry_point: 'add',
    ...overrides,
  };
}

function makeGzData(problems: object[]): Buffer {
  const lines = problems.map(p => JSON.stringify(p)).join('\n') + '\n';
  return gzipSync(Buffer.from(lines));
}

// ── downloadFile ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mod: typeof import('../../src/commands/humaneval.js');

beforeEach(async () => {
  mod = await import('../../src/commands/humaneval.js');
});

describe('downloadFile', () => {
  it('rejects on non-200 response', async () => {
    // We can only test the error-state without a real server by stubbing https
    // The test below drives the download-failure branch via runHumanEvalMenu's
    // _downloadFn override, which is the cleanest public seam.
    const error = new Error('HTTP 404');
    const failing = vi.fn().mockRejectedValue(error);

    const tmpDir = mkdtempSync(join(tmpdir(), 'humaneval-dl-'));
    try {
      process.env['HUMANEVAL_DATA'] = join(tmpDir, 'missing.jsonl.gz');
      const written: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { written.push(String(c)); return true; });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model', failing);

      expect(failing).toHaveBeenCalled();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── runHumanEvalMenu ──────────────────────────────────────────────────────────

describe('runHumanEvalMenu', () => {
  let originalIsTTY: boolean | undefined;
  let originalData: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    originalData = process.env['HUMANEVAL_DATA'];
    tmpDir = mkdtempSync(join(tmpdir(), 'humaneval-menu-'));
    pickerStore.capturedOpts = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    if (originalData === undefined) delete process.env['HUMANEVAL_DATA'];
    else process.env['HUMANEVAL_DATA'] = originalData;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeData(problems: object[]) {
    const dataPath = join(tmpDir, 'HumanEval.jsonl.gz');
    writeFileSync(dataPath, makeGzData(problems));
    process.env['HUMANEVAL_DATA'] = dataPath;
    return dataPath;
  }

  it('shows downloading message and reports failure when dataset is missing and download fails', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    process.env['HUMANEVAL_DATA'] = join(tmpDir, 'HumanEval.jsonl.gz');

    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { written.push(String(chunk)); return true; });
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
    const failingDownload = vi.fn().mockRejectedValue(new Error('network error'));

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o', failingDownload);

    expect(failingDownload).toHaveBeenCalled();
    expect(written.some(w => w.includes('Downloading HumanEval dataset'))).toBe(true);
    expect(logged.some(l => l.includes('Could not download dataset'))).toBe(true);
  });

  it('lists problems to stdout in non-TTY mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    writeData([makeProblem()]);

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

    expect(logged.some(l => l.includes('test/0'))).toBe(true);
  });

  it('non-TTY mode shows header and entry point for each problem', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    writeData([makeProblem({ task_id: 'HumanEval/1', entry_point: 'my_func' })]);

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

    expect(logged.some(l => l.includes('HumanEval/1'))).toBe(true);
    expect(logged.some(l => l.includes('my_func'))).toBe(true);
  });

  it('shows HumanEval problems header in non-TTY mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    writeData([makeProblem()]);

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

    expect(logged.some(l => l.includes('HumanEval problems'))).toBe(true);
  });

  it('logs error when dataset file cannot be parsed', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    // Write a .gz file with invalid JSON content
    const { gzipSync: gz } = await import('zlib');
    const dataPath = join(tmpDir, 'bad.jsonl.gz');
    writeFileSync(dataPath, gz(Buffer.from('not-valid-json\n')));
    process.env['HUMANEVAL_DATA'] = dataPath;

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

    expect(logged.some(l => l.includes('Failed to load HumanEval dataset'))).toBe(true);
  });

  describe('TTY mode — picker', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    });

    it('opens the picker with TTY stdin and renders picker lines', async () => {
      writeData([makeProblem()]);
      const { runRawPicker } = await import('../../src/cli/raw-picker.js');
      vi.mocked(runRawPicker).mockResolvedValueOnce(null);

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');

      expect(runRawPicker).toHaveBeenCalled();
    });

    it('renders picker lines with Run All and problem list', async () => {
      writeData([makeProblem({ task_id: 'test/0', entry_point: 'add' })]);

      const { runRawPicker } = await import('../../src/cli/raw-picker.js');
      vi.mocked(runRawPicker).mockImplementationOnce((_rl, opts: unknown) => {
        const o = opts as { render: () => string[] };
        const lines = o.render();
        expect(lines.some(l => l.includes('Run All'))).toBe(true);
        expect(lines.some(l => l.includes('test/0'))).toBe(true);
        return Promise.resolve(null);
      });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');
    });

    it('renders picker counter line', async () => {
      writeData([makeProblem(), makeProblem({ task_id: 'test/1', entry_point: 'sub' })]);

      const { runRawPicker } = await import('../../src/cli/raw-picker.js');
      vi.mocked(runRawPicker).mockImplementationOnce((_rl, opts: unknown) => {
        const o = opts as { render: () => string[] };
        const lines = o.render();
        // Counter: "1 / 3" (Run All + 2 problems)
        expect(lines.some(l => l.includes('/ 3'))).toBe(true);
        return Promise.resolve(null);
      });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');
    });

    it('Escape key in picker returns without running problems', async () => {
      writeData([makeProblem()]);
      const { runRawPicker } = await import('../../src/cli/raw-picker.js');

      let onKeyFn: ((key: string, redraw: () => void, close: (v: unknown) => void) => void) | null = null;
      vi.mocked(runRawPicker).mockImplementationOnce((_rl, opts: unknown) => {
        onKeyFn = (opts as { onKey: typeof onKeyFn }).onKey;
        onKeyFn!('\x1b', vi.fn(), vi.fn());
        return Promise.resolve(null);
      });

      const logged: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');
      // No problems were run, so no PASS/FAIL logged
      expect(logged.filter(l => l.includes('PASS') || l.includes('FAIL'))).toHaveLength(0);
    });

    it('up/down navigation wraps around in the picker', async () => {
      writeData([makeProblem()]);
      const { runRawPicker } = await import('../../src/cli/raw-picker.js');

      vi.mocked(runRawPicker).mockImplementationOnce((_rl, opts: unknown) => {
        const o = opts as { onKey: (key: string, redraw: () => void, close: (v: unknown) => void) => void; render: () => string[] };
        const redraw = vi.fn();
        const close = vi.fn();
        // Down arrow from 0 → 1, up arrow back → 0, up again → wraps to last
        o.onKey('\x1b[B', redraw, close);
        o.onKey('\x1b[A', redraw, close);
        o.onKey('\x1b[A', redraw, close);
        expect(redraw).toHaveBeenCalledTimes(3);
        return Promise.resolve(null);
      });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');
    });

    it('shows pass count in Run All row when there are results', async () => {
      writeData([makeProblem()]);
      const { runRawPicker } = await import('../../src/cli/raw-picker.js');
      const { getHumanEvalResults } = await import('../../src/providers/model-store.js');
      vi.mocked(getHumanEvalResults).mockReturnValueOnce({ 'test/0': 'pass' });

      vi.mocked(runRawPicker).mockImplementationOnce((_rl, opts: unknown) => {
        const o = opts as { render: () => string[] };
        const lines = o.render();
        expect(lines.some(l => l.includes('1/1 passed'))).toBe(true);
        return Promise.resolve(null);
      });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'fake:model');
    });
  });
});
