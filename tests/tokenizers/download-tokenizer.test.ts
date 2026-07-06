import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
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
    await expect(ensureTokenizerFile('llama-3', 'NousResearch/Meta-Llama-3-8B', 'tokenizer.json', downloadFn)).resolves.toBe(dest);
    expect(downloadFn).not.toHaveBeenCalled();
  });

  it('downloads to a sibling temp path, then promotes it to the cache path on success', async () => {
    const dest = tokenizerCachePath('deepseek-v3');
    const downloadFn = vi.fn((_url: string, d: string) => {
      mkdirSync(join(storeDir, 'tokenizers', 'deepseek-v3'), { recursive: true });
      writeFileSync(d, '{}');
      return Promise.resolve();
    });
    await expect(ensureTokenizerFile('deepseek-v3', 'deepseek-ai/DeepSeek-V3', 'tokenizer.json', downloadFn)).resolves.toBe(dest);
    // Written to <dest>.download (never dest directly), then renamed onto dest.
    expect(downloadFn).toHaveBeenCalledWith('https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json', `${dest}.download`);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(`${dest}.download`)).toBe(false);
  });

  it('re-downloads when the cached file exists but is empty (0-byte leftover)', async () => {
    const dest = tokenizerCachePath('llama-3');
    mkdirSync(join(storeDir, 'tokenizers', 'llama-3'), { recursive: true });
    writeFileSync(dest, ''); // the broken-cache repro: an earlier failed download left this behind
    const downloadFn = vi.fn((_url: string, d: string) => { writeFileSync(d, '{"real":"tokenizer"}'); return Promise.resolve(); });
    await expect(ensureTokenizerFile('llama-3', 'NousResearch/Meta-Llama-3-8B', 'tokenizer.json', downloadFn)).resolves.toBe(dest);
    expect(downloadFn).toHaveBeenCalledOnce();
  });

  it('returns null and leaves no file at dest when downloadFn resolves but writes nothing', async () => {
    const dest = tokenizerCachePath('deepseek-v4');
    const downloadFn = vi.fn((_url: string, d: string) => {
      mkdirSync(join(storeDir, 'tokenizers', 'deepseek-v4'), { recursive: true });
      writeFileSync(d, ''); // "succeeds" but produces an empty body — must not be promoted
      return Promise.resolve();
    });
    await expect(ensureTokenizerFile('deepseek-v4', 'deepseek-ai/DeepSeek-V4-Pro', 'tokenizer.json', downloadFn)).resolves.toBeNull();
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.download`)).toBe(false);
  });

  it('returns null (never throws) and leaves no dest file when downloadFn fails', async () => {
    const dest = tokenizerCachePath('glm-4');
    const downloadFn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(ensureTokenizerFile('glm-4', 'zai-org/GLM-4.5-Air', 'tokenizer.json', downloadFn)).resolves.toBeNull();
    expect(existsSync(dest)).toBe(false);
  });

  it('fetches and caches a non-default filename (Tekken uses tekken.json)', async () => {
    const dest = tokenizerCachePath('mistral-tekken', 'tekken.json');
    expect(dest).toBe(join(storeDir, 'tokenizers', 'mistral-tekken', 'tekken.json'));
    const downloadFn = vi.fn((_url: string, d: string) => {
      mkdirSync(join(storeDir, 'tokenizers', 'mistral-tekken'), { recursive: true });
      writeFileSync(d, '{"config":{}}');
      return Promise.resolve();
    });
    await expect(ensureTokenizerFile('mistral-tekken', 'mistralai/Mistral-Nemo-Instruct-2407', 'tekken.json', downloadFn)).resolves.toBe(dest);
    expect(downloadFn).toHaveBeenCalledWith('https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407/resolve/main/tekken.json', `${dest}.download`);
  });
});
