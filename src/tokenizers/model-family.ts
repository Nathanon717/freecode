// One named predicate per tokenizer backend family, matched against the active
// `providerId:modelId` string. Each phase adds a predicate here without
// touching the shared type.
export type TokenizerFamily = string;

export const GPT_OSS_FAMILY = 'gpt-oss';
export const LLAMA3_FAMILY = 'llama-3';
export const DEEPSEEK_V3_FAMILY = 'deepseek-v3';
export const DEEPSEEK_V4_FAMILY = 'deepseek-v4';
export const GLM4_FAMILY = 'glm-4';

// Canonical HF repo whose tokenizer.json is downloaded for each family backed
// by backends/bpe-json.ts. Verified live against the HF API (content-hash
// compared across sibling model versions, not guessed) — see
// docs/plans/tokenizer-registry-plan.md's Phase 3 notes for the full
// verification trail and why each repo was picked over its siblings.
export const HF_TOKENIZER_REPO: Partial<Record<TokenizerFamily, string>> = {
  [LLAMA3_FAMILY]: 'NousResearch/Meta-Llama-3-8B',
  [DEEPSEEK_V3_FAMILY]: 'deepseek-ai/DeepSeek-V3',
  [DEEPSEEK_V4_FAMILY]: 'deepseek-ai/DeepSeek-V4-Pro',
  [GLM4_FAMILY]: 'zai-org/GLM-4.5-Air',
};

// Matches every real GPT-OSS model ID seen across providers: `openai/gpt-oss-120b`
// (Groq, NVIDIA), `openai/gpt-oss-120b:free` (OpenRouter), and the bare
// `gpt-oss-120b` (Cerebras) — the substring is stable across all of them.
function isGptOss(modelId: string): boolean {
  return /gpt-oss/i.test(modelId);
}

// Llama 3.0/3.1/3.2/3.3 finetunes keep the base Llama 3 tokenizer (verified:
// tokenizer.json is unchanged across the line). Matches real IDs like
// `meta-llama/llama-3.3-70b-instruct:free`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`,
// `@cf/meta/llama-3.1-8b-instruct`.
function isLlama3(modelId: string): boolean {
  return /llama-3/i.test(modelId);
}

// DeepSeek retrained its tokenizer between the V3/R1 generation and V4 — the
// two are NOT the same family (confirmed: different tokenizer.json content
// hash, ~7.8MB vs ~6.3MB). "Distill" models (e.g. `deepseek-r1-distill-llama-70b`,
// `deepseek-r1-distill-qwen-32b`) reuse their base model's tokenizer, not
// DeepSeek's own — excluded rather than guessed, since a wrong-family exact
// count is worse than the safe fallback.
function isDeepSeekV3(modelId: string): boolean {
  return !/distill/i.test(modelId) && /deepseek-v3|deepseek-chat-v3|deepseek-r1/i.test(modelId);
}

function isDeepSeekV4(modelId: string): boolean {
  return !/distill/i.test(modelId) && /deepseek-v4/i.test(modelId);
}

// Only the GLM-4.5–4.7 main line (including "-air" and "-v" vision variants)
// is verified to share one tokenizer.json content hash. "-flash" variants
// retrain the vocab and pre-4.5 releases (e.g. `glm-4-9b-chat`) predate the
// fast tokenizer entirely — both are deliberately excluded and fall back to
// the generic estimate instead of a wrong exact count.
function isGlm4(modelId: string): boolean {
  return /glm-4\.[5-7]/i.test(modelId) && !/flash/i.test(modelId);
}

export function resolveTokenizerFamily(modelId: string): TokenizerFamily | null {
  if (isGptOss(modelId)) return GPT_OSS_FAMILY;
  if (isDeepSeekV4(modelId)) return DEEPSEEK_V4_FAMILY;
  if (isDeepSeekV3(modelId)) return DEEPSEEK_V3_FAMILY;
  if (isLlama3(modelId)) return LLAMA3_FAMILY;
  if (isGlm4(modelId)) return GLM4_FAMILY;
  return null;
}
