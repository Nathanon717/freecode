import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../../src/logger.js', () => ({ logError: vi.fn() }));

import { writeResultPlaceholder, makePartialResultUpdater, writeFinalResult } from '../../src/eval/result-sink.js';
import { readFileSync } from 'fs';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-result-sink-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('writeResultPlaceholder', () => {
  it('creates a file with a placeholder entry', () => {
    const path = join(tempDir, 'result.json');
    writeResultPlaceholder(path, 'openai:gpt-4o');
    const entries = JSON.parse(readFileSync(path, 'utf-8')) as unknown[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ providerId: 'openai', modelId: 'gpt-4o', totalTokens: 0 });
  });

  it('appends to an existing file', () => {
    const path = join(tempDir, 'result.json');
    writeResultPlaceholder(path, 'openai:gpt-4o');
    writeResultPlaceholder(path, 'anthropic:claude-3-5-sonnet');
    const entries = JSON.parse(readFileSync(path, 'utf-8')) as unknown[];
    expect(entries).toHaveLength(2);
  });
});

describe('makePartialResultUpdater', () => {
  it('updates the last entry with quota when quota is non-null', () => {
    const path = join(tempDir, 'result.json');
    writeResultPlaceholder(path, 'openai:gpt-4o');
    const updater = makePartialResultUpdater(path);
    updater({ quota: [{ label: 'rpm', remaining: 50, limit: 100 }] });
    const entries = JSON.parse(readFileSync(path, 'utf-8')) as Array<Record<string, unknown>>;
    expect(entries[0]['quota']).toBeDefined();
  });

  it('does nothing when quota is null', () => {
    const path = join(tempDir, 'result.json');
    writeResultPlaceholder(path, 'openai:gpt-4o');
    const before = readFileSync(path, 'utf-8');
    const updater = makePartialResultUpdater(path);
    updater({ quota: null });
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });
});

describe('writeFinalResult', () => {
  it('replaces the last placeholder entry with the full result', () => {
    const path = join(tempDir, 'result.json');
    writeResultPlaceholder(path, 'openai:gpt-4o');
    writeFinalResult(path, {
      totalTokens: 1234,
      promptTokens: 1000,
      outputTokens: 234,
      providerId: 'openai',
      modelId: 'gpt-4o',
      quota: null,
    });
    const entries = JSON.parse(readFileSync(path, 'utf-8')) as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]['totalTokens']).toBe(1234);
    expect(entries[0]['promptTokens']).toBe(1000);
  });
});
