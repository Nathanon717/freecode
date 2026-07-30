// One named predicate per tokenizer backend family, matched against the active
// `providerId:modelId` string. Each phase adds a predicate here without
// touching the shared type.
export type TokenizerFamily = string;

export const GPT_OSS_FAMILY = 'gpt-oss';
export const LLAMA3_FAMILY = 'llama-3';
export const DEEPSEEK_V3_FAMILY = 'deepseek-v3';
export const DEEPSEEK_V4_FAMILY = 'deepseek-v4';
export const GLM4_FAMILY = 'glm-4';
export const MISTRAL_TEKKEN_FAMILY = 'mistral-tekken';

// Tekken is fetched from a different repo file (`tekken.json`, not the
// `tokenizer.json` the HF-fast families use), so it's not in HF_TOKENIZER_REPO;
// count.ts loads it through backends/tekken.ts. The whole modern Mistral line
// shares one byte-BPE vocab (Nemo v3 and Magistral v11 verified byte-identical),
// so one repo covers it.
export const MISTRAL_TEKKEN_REPO = 'mistralai/Mistral-Nemo-Instruct-2407';
export const TEKKEN_FILENAME = 'tekken.json';

// Canonical HF repo whose tokenizer.json is downloaded for each family backed
// by backends/bpe-json.ts. Verified live against the HF API (content-hash
// compared across sibling model versions, not guessed) — see
// docs/map/tokenizers/model-family.md for the full verification trail and
// why each repo was picked over its siblings.
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

// Modern Mistral (NeMo-era and newer) all use the Tekken byte-BPE tokenizer.
// Built ID-by-ID against the live catalog (.freecode/model-cache.json), not a
// broad regex — the naming has landmines. Hard excludes come first: a wrong
// exact count is worse than the safe fallback.
function isMistralTekken(modelId: string): boolean {
  const id = modelId.toLowerCase();
  // NVIDIA Nemotron / anything under nvidia/ is Llama-family, NOT Mistral —
  // despite the "nemo" substring. (`nv-mistralai/mistral-nemo-*` is real Mistral
  // Nemo and is intentionally not caught here.)
  if (/nemotron|nvidia\//.test(id)) return false;
  // Legacy SentencePiece era (pre-Tekken): Mixtral, Mistral 7B, first-gen
  // Codestral, and any `-v0.x` checkpoint.
  if (/mixtral|mistral-7b|codestral-22b|-v0\.\d/.test(id)) return false;
  // Non-chat models — no context-window counting need, and different tokenizers.
  if (/-embed|-ocr|-moderation|voxtral|saba/.test(id)) return false;
  // Pre-Tekken Large (2407/2411 ship tokenizer.json + SentencePiece, no tekken.json).
  if (/mistral-large-(2407|2411)|mistral-large-2-/.test(id)) return false;
  // Include: the modern Tekken line.
  return (
    /mistral-nemo|open-mistral-nemo|mistral-tiny-2407/.test(id) ||
    /ministral-\d/.test(id) ||
    /mistral-small-(3|4|24b|2501|2506|2603|latest)/.test(id) ||
    /magistral/.test(id) ||
    /devstral/.test(id) ||
    /codestral/.test(id) ||
    /pixtral/.test(id) ||
    /mistral-medium-(3|2505|2508|2604)/.test(id) ||
    /mistral-vibe-cli/.test(id) ||
    /mistral-large-(2512|3)/.test(id)
  );
}

export function resolveTokenizerFamily(modelId: string): TokenizerFamily | null {
  if (isGptOss(modelId)) return GPT_OSS_FAMILY;
  if (isDeepSeekV4(modelId)) return DEEPSEEK_V4_FAMILY;
  if (isDeepSeekV3(modelId)) return DEEPSEEK_V3_FAMILY;
  if (isLlama3(modelId)) return LLAMA3_FAMILY;
  if (isGlm4(modelId)) return GLM4_FAMILY;
  if (isMistralTekken(modelId)) return MISTRAL_TEKKEN_FAMILY;
  return null;
}
