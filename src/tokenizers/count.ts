import type { CoreMessage } from 'ai';
import { loadBpeJsonEncoder } from './backends/bpe-json.js';
import { getGptOssEncoder } from './backends/tiktoken.js';
import { ensureTokenizerFile } from './download-tokenizer.js';
import { estimateContextTokens } from './fallback-estimate.js';
import { GPT_OSS_FAMILY, HF_TOKENIZER_REPO, resolveTokenizerFamily, type TokenizerFamily } from './model-family.js';

export interface TokenizerEncoder {
  countMessages(messages: CoreMessage[]): number;
}

// Keyed by family (many model IDs share one family), not by model ID.
const encoderCache = new Map<TokenizerFamily, TokenizerEncoder>();

// De-dupes concurrent preload calls for the same family (e.g. rapid model
// switches before a download finishes) so it isn't kicked off twice.
const pendingLoads = new Map<TokenizerFamily, Promise<void>>();

// Synchronous so it's safe on a hot path (e.g. once per keystroke). Reads
// whatever's already in the in-memory cache; never blocks, never throws.
// Falls back to the generic tiktoken estimate when no family is resolved or
// no encoder has been compiled for it yet — the only reachable path until a
// later phase registers an exact backend into encoderCache.
export function countTokens(messages: CoreMessage[], modelId: string): number {
  const family = resolveTokenizerFamily(modelId);
  const encoder = family !== null ? encoderCache.get(family) : undefined;
  return encoder ? encoder.countMessages(messages) : estimateContextTokens(messages);
}

// Downloads (if needed) and loads a family backed by backends/bpe-json.ts.
// Never throws — a failed download or parse just leaves encoderCache unset.
async function loadHfEncoder(family: TokenizerFamily, repoId: string): Promise<void> {
  const path = await ensureTokenizerFile(family, repoId);
  if (path) encoderCache.set(family, loadBpeJsonEncoder(path));
}

// Resolves the family and compiles/caches its encoder in the background so
// countTokens can read it synchronously on the next call. GPT-OSS resolves
// immediately (bundled); the HF fast-tokenizer families (Llama 3.x, DeepSeek
// V3/V4, GLM-4.5-4.7) go through ensure-download → load → cache, since Phase 3
// is the first to actually fetch tokenizer files over the network. Never
// throws — an unresolved family or a download/build failure just leaves
// encoderCache unset, which keeps countTokens on the fallback path.
export async function preloadTokenizerFor(modelId: string): Promise<void> {
  const family = resolveTokenizerFamily(modelId);
  if (family === null || encoderCache.has(family)) return;
  const pending = pendingLoads.get(family) ?? (async () => {
    try {
      if (family === GPT_OSS_FAMILY) {
        encoderCache.set(family, getGptOssEncoder());
      } else {
        const repoId = HF_TOKENIZER_REPO[family];
        if (repoId) await loadHfEncoder(family, repoId);
      }
    } catch {
      // Leave encoderCache unset; countTokens falls back to the generic estimate.
    } finally {
      pendingLoads.delete(family);
    }
  })();
  pendingLoads.set(family, pending);
  return pending;
}
