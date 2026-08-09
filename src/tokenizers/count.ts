/**
 * @role The engine's public entry point: a synchronous `countTokens` safe to call on a hot path (e.g. once per keystroke), backed by an in-memory encoder cache keyed by family, plus an async `preloadTokenizerFor` that compiles and caches exact backends in the background (GPT-OSS bundled since Phase 2; Llama 3.x/DeepSeek V3+V4/GLM-4.5-4.7 downloaded-and-cached since Phase 3; modern Mistral Tekken since Phase 4). `commands/model.ts` reads the synchronous `hasExactTokenizer` capability check to badge picker rows. `cli/session-modes.ts` is the live consumer of the encoder cache: it calls `preloadTokenizerFor` when the active model changes and `countTextTokens` to show the tool-approval preview's "+N tokens" count. The footer `ctx` slot deliberately does **not** use this engine: it shows the provider's own reported `prompt_tokens` (measured, cache-inclusive on most providers) rather than a local estimate that would systematically undercount — see `cli/chrome/footer-status.ts`.
 */

import type { CoreMessage } from 'ai';
import { loadBpeJsonEncoder } from './backends/bpe-json.js';
import { getGptOssEncoder } from './backends/tiktoken.js';
import { loadTekkenEncoder } from './backends/tekken.js';
import { ensureTokenizerFile } from './download-tokenizer.js';
import { estimateContextTokens, estimateTextTokens } from './fallback-estimate.js';
import {
  GPT_OSS_FAMILY,
  HF_TOKENIZER_REPO,
  MISTRAL_TEKKEN_FAMILY,
  MISTRAL_TEKKEN_REPO,
  TEKKEN_FILENAME,
  resolveTokenizerFamily,
  type TokenizerFamily,
} from './model-family.js';

export interface TokenizerEncoder {
  countMessages(messages: CoreMessage[]): number;
  /** Token count for a bare string, with no chat/system-prompt overhead. */
  countText(text: string): number;
}

export interface TokenCount {
  tokens: number;
  /** true when an exact encoder produced the count; false for the generic estimate. */
  exact: boolean;
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

// Count the tokens a bare string contributes on its own (no chat or
// system-prompt overhead), using the model's exact encoder when one is loaded
// and the generic estimate otherwise. `exact` reports which path ran so callers
// can flag an estimate as approximate. Synchronous, never throws — same hot-path
// contract as countTokens.
export function countTextTokens(text: string, modelId: string): TokenCount {
  const family = resolveTokenizerFamily(modelId);
  const encoder = family !== null ? encoderCache.get(family) : undefined;
  return encoder
    ? { tokens: encoder.countText(text), exact: true }
    : { tokens: estimateTextTokens(text), exact: false };
}

// Does an exact tokenizer backend *exist* for this model? Capability check for
// catalog UI (the model-picker badge) — not whether an encoder is loaded yet.
export function hasExactTokenizer(modelId: string): boolean {
  return resolveTokenizerFamily(modelId) !== null;
}

// Downloads (if needed) and loads a family backed by backends/bpe-json.ts.
// Never throws — a failed download or parse just leaves encoderCache unset.
async function loadHfEncoder(family: TokenizerFamily, repoId: string): Promise<void> {
  const path = await ensureTokenizerFile(family, repoId);
  if (path) encoderCache.set(family, loadBpeJsonEncoder(path));
}

// Same ensure-download → load → cache shape as loadHfEncoder, but fetches the
// repo's tekken.json (not tokenizer.json) and builds a tiktoken encoder from it.
async function loadTekkenFamily(family: TokenizerFamily): Promise<void> {
  const path = await ensureTokenizerFile(family, MISTRAL_TEKKEN_REPO, TEKKEN_FILENAME);
  if (path) encoderCache.set(family, loadTekkenEncoder(path));
}

// Resolves the family and compiles/caches its encoder in the background so
// countTokens can read it synchronously on the next call. GPT-OSS resolves
// immediately (bundled); the HF fast-tokenizer families (Llama 3.x, DeepSeek
// V3/V4, GLM-4.5-4.7) and the modern Mistral Tekken family go through
// ensure-download → load → cache over the network. Never
// throws — an unresolved family or a download/build failure just leaves
// encoderCache unset, which keeps countTokens on the fallback path.
export async function preloadTokenizerFor(modelId: string): Promise<void> {
  const family = resolveTokenizerFamily(modelId);
  if (family === null || encoderCache.has(family)) return;
  const pending = pendingLoads.get(family) ?? (async () => {
    try {
      if (family === GPT_OSS_FAMILY) {
        encoderCache.set(family, getGptOssEncoder());
      } else if (family === MISTRAL_TEKKEN_FAMILY) {
        await loadTekkenFamily(family);
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
