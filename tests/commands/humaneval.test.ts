import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Interface } from 'readline';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

let mod: typeof import('../../src/commands/humaneval.js');

beforeEach(async () => {
  mod = await import('../../src/commands/humaneval.js');
});

describe('runHumanEvalMenu', () => {
  let originalIsTTY: boolean | undefined;
  let originalData: string | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    originalData = process.env['HUMANEVAL_DATA'];
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    if (originalData === undefined) delete process.env['HUMANEVAL_DATA'];
    else process.env['HUMANEVAL_DATA'] = originalData;
    vi.restoreAllMocks();
  });

  it('logs an error and returns when the data file does not exist', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    process.env['HUMANEVAL_DATA'] = '/nonexistent/path/HumanEval.jsonl.gz';

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

    expect(logged.some(l => l.includes('Failed to load HumanEval dataset'))).toBe(true);
  });

  it('lists problems to stdout in non-TTY mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const tmpDir = mkdtempSync(join(tmpdir(), 'humaneval-test-'));
    try {
      const problem = { task_id: 'test/0', prompt: 'def f():\n    pass\n', entry_point: 'f', canonical_solution: '    return None\n', test: 'def check(c):\n    c()\n' };
      const gz = gzipSync(Buffer.from(JSON.stringify(problem) + '\n'));
      const dataPath = join(tmpDir, 'HumanEval.jsonl.gz');
      writeFileSync(dataPath, gz);
      process.env['HUMANEVAL_DATA'] = dataPath;

      const logged: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

      await mod.runHumanEvalMenu(fakeRl, '/tmp', () => 'openai:gpt-4o');

      expect(logged.some(l => l.includes('test/0'))).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
