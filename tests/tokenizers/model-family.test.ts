import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_V3_FAMILY,
  DEEPSEEK_V4_FAMILY,
  GLM4_FAMILY,
  GPT_OSS_FAMILY,
  LLAMA3_FAMILY,
  MISTRAL_TEKKEN_FAMILY,
  resolveTokenizerFamily,
} from '../../src/tokenizers/model-family.js';

describe('resolveTokenizerFamily', () => {
  // Kimi K2 stays null on purpose: moonshotai ships only a raw `tiktoken.model`
  // ranks file, never a tokenizer.json, across every checked repo (K2, K2-Thinking,
  // unsloth/mlx-community mirrors) — out of scope for this phase's HF fast-tokenizer
  // backend. `deepseek-r1-distill-*` also stays null: distilled models reuse their
  // base model's tokenizer, not DeepSeek's own.
  it.each([
    'openai:gpt-4o',
    'openrouter:moonshotai/kimi-k2-instruct',
    'groq:deepseek-r1-distill-llama-70b',
    'nvidia:deepseek-r1-distill-qwen-32b',
    'openrouter:z-ai/glm-4.5-flash',
    'openrouter:z-ai/glm-4.7-flash',
    'openrouter:deepseek/deepseek-chat',
    '',
  ])('returns null for %p (no exact family implemented for this model)', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBeNull();
  });

  // Real fetched model IDs across providers (see docs/providers.md): Groq/NVIDIA
  // use `openai/gpt-oss-120b`, OpenRouter appends `:free`, Cerebras uses the bare
  // `gpt-oss-120b`.
  it.each([
    'groq:openai/gpt-oss-120b',
    'groq:openai/gpt-oss-safeguard-20b',
    'openrouter:openai/gpt-oss-20b:free',
    'nvidia:openai/gpt-oss-20b',
    'cerebras:gpt-oss-120b',
  ])('resolves %p to the GPT-OSS family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(GPT_OSS_FAMILY);
  });

  // Real fetched IDs from .freecode/model-cache.json.
  it.each([
    'groq:llama-3.3-70b-versatile',
    'openrouter:meta-llama/llama-3.3-70b-instruct:free',
    'nvidia:nvidia/llama-3.3-nemotron-super-49b-v1.5',
    'openrouter:aion-labs/aion-rp-llama-3.1-8b',
    'cloudflare:@cf/meta/llama-3.1-8b-instruct',
  ])('resolves %p to the Llama 3 family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(LLAMA3_FAMILY);
  });

  it.each([
    'openrouter:deepseek/deepseek-r1',
    'openrouter:deepseek/deepseek-r1-0528',
    'openrouter:deepseek/deepseek-chat-v3.1',
    'openrouter:deepseek/deepseek-chat-v3-0324',
    'openrouter:deepseek/deepseek-v3.2',
    'openrouter:deepseek/deepseek-v3.1-terminus',
    // Codenamed, so there is no family substring to match — mapped from a live
    // wire measurement instead (see the map page's "Probing an unknown model").
    // The V3-vs-V4 split is load-bearing here: only V4 carries `<think>` as a
    // single added token, and big-pickle's provider charges V3's 3.
    'zen:big-pickle',
  ])('resolves %p to the DeepSeek V3 family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(DEEPSEEK_V3_FAMILY);
  });

  it.each([
    'openrouter:deepseek-v4-pro',
    'openrouter:deepseek-v4-flash',
    'openrouter:deepseek-v4-flash-free',
  ])('resolves %p to the DeepSeek V4 family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(DEEPSEEK_V4_FAMILY);
  });

  // Nemotron 3 counts as Tekken (wire-measured across nvidia/openrouter/zen);
  // every other Nemotron generation stays excluded, and the llama-3.x ones are
  // claimed by the Llama predicate before this one runs.
  it.each([
    'nvidia:nvidia/nemotron-3-nano-30b-a3b',
    'nvidia:nvidia/nemotron-3-super-120b-a12b',
    'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    'openrouter:nvidia/nemotron-3-nano-30b-a3b:free',
    'zen:nemotron-3-ultra-free',
  ])('resolves %p to the Mistral Tekken family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(MISTRAL_TEKKEN_FAMILY);
  });

  // The `-omni` variants measured one token apart from Tekken on both providers
  // that serve them — a near neighbour, not a member — and 3.5 / 4 / the
  // unnumbered Nemotrons were never measured at all.
  it.each([
    'nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia:nvidia/nemotron-3-embed-1b',
    'nvidia:nvidia/nemotron-3.5-content-safety',
    'nvidia:nvidia/nemotron-4-340b-instruct',
    'nvidia:nvidia/nemotron-parse',
  ])('leaves %p unmapped (not a measured Tekken member)', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBeNull();
  });

  it.each([
    'openrouter:z-ai/glm-4.5',
    'openrouter:z-ai/glm-4.5-air',
    'openrouter:z-ai/glm-4.5v',
    'openrouter:z-ai/glm-4.6',
    'openrouter:z-ai/glm-4.6v',
    'openrouter:z-ai/glm-4.7',
  ])('resolves %p to the GLM-4 family', (modelId) => {
    expect(resolveTokenizerFamily(modelId)).toBe(GLM4_FAMILY);
  });
});
