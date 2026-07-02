import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_V3_FAMILY,
  DEEPSEEK_V4_FAMILY,
  GLM4_FAMILY,
  GPT_OSS_FAMILY,
  LLAMA3_FAMILY,
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

  // Real fetched IDs from .freecode/model-cache.json (see plan Phase 3 notes).
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
