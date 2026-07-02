import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTokenizerFile, tokenizerCachePath } from '../../src/tokenizers/download-tokenizer.js';

describe('download-tokenizer', () => {
  let storeDir: string;

  beforeEach(() => {
    storeDir = join(tmpdir(), `freecode-tokenizer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env['FREECODE_STORE'] = storeDir;
  });

  afterEach(() => {
    delete process.env['FREECODE_STORE'];
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('tokenizerCachePath is keyed by family under <store>/tokenizers/<family>/tokenizer.json', () => {
    expect(tokenizerCachePath('llama-3')).toBe(join(storeDir, 'tokenizers', 'llama-3', 'tokenizer.json'));
  });

  it('skips downloadFn and returns the cached path when the file already exists', async () => {
    const dest = tokenizerCachePath('llama-3');
    mkdirSync(join(storeDir, 'tokenizers', 'llama-3'), { recursive: true });
    writeFileSync(dest, '{}');
    const downloadFn = vi.fn();
    await expect(ensureTokenizerFile('llama-3', 'NousResearch/Meta-Llama-3-8B', downloadFn)).resolves.toBe(dest);
    expect(downloadFn).not.toHaveBeenCalled();
  });

  it('calls downloadFn with the resolve URL and cache path, and returns the path on success', async () => {
    const dest = tokenizerCachePath('deepseek-v3');
    const downloadFn = vi.fn((_url: string, d: string) => {
      mkdirSync(join(storeDir, 'tokenizers', 'deepseek-v3'), { recursive: true });
      writeFileSync(d, '{}');
      return Promise.resolve();
    });
    await expect(ensureTokenizerFile('deepseek-v3', 'deepseek-ai/DeepSeek-V3', downloadFn)).resolves.toBe(dest);
    expect(downloadFn).toHaveBeenCalledWith('https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json', dest);
  });

  it('returns null (never throws) when downloadFn fails', async () => {
    const downloadFn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(ensureTokenizerFile('glm-4', 'zai-org/GLM-4.5-Air', downloadFn)).resolves.toBeNull();
  });
});
