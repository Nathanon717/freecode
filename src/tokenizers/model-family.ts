/**
 * @role Resolves a model ID string to the tokenizer backend family that should count its tokens exactly. One named predicate per family (mirrors `providers/model-quirks.ts`), matched against the active `providerId:modelId` string — not a static per-model field, since most providers fetch their model lists live at runtime.
 *
 * @readwhen
 * - Adding a new exact tokenizer backend: add its predicate (and, for an HF fast-tokenizer family, its `HF_TOKENIZER_REPO` entry) here, matched against real fetched model ID strings (pull a live dump via the registry / `model-cache.json` first — providers use different ID conventions).
 * - Deciding whether some model belongs to a family already implemented here: don't reason from its name. Repo-hash it if it has a repo, and `--probe` it if it doesn't — see "Probing an unknown model".
 */

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

/**
 * Tekken is fetched from a different repo file (`tekken.json`, not the
 * `tokenizer.json` the HF-fast families use), so it's not in HF_TOKENIZER_REPO;
 * count.ts loads it through backends/tekken.ts. The whole modern Mistral line
 * shares one byte-BPE vocab (Nemo v3 and Magistral v11 verified byte-identical),
 * so one repo covers it.
 */
export const MISTRAL_TEKKEN_REPO = 'mistralai/Mistral-Nemo-Instruct-2407';
export const TEKKEN_FILENAME = 'tekken.json';

/**
 * Canonical HF repo whose tokenizer.json is downloaded for each family backed
 * by backends/bpe-json.ts. Verified live against the HF API (content-hash
 * compared across sibling model versions, not guessed) — see this page's
 * "Verification trail" and "Family coverage" sections for why each repo was
 * picked over its siblings.
 */
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

// DeepSeek's V3/R1 and V4 generations are kept as separate families. Not a
// retrained vocab: model.vocab, model.merges, pre_tokenizer, normalizer, decoder
// and post_processor all hash byte-identically between the two. The whole delta is
// added_tokens (818 in V3 vs 1283 in V4), and those are live during encoding — so
// `<think>` costs 3 tokens under V3 and 1 under V4. See the map page's "Family
// coverage" section. "Distill" models (e.g. `deepseek-r1-distill-llama-70b`,
// `deepseek-r1-distill-qwen-32b`) reuse their base model's tokenizer, not
// DeepSeek's own — excluded rather than guessed, since a wrong-family exact
// count is worse than the safe fallback.
// Codenamed models carry no family substring to group by, so the only possible
// rule is the literal ID — the one case where a per-ID entry is right rather
// than lazy. Each one here is wire-measured, never inferred from the name:
// scripts/diagnostics/verify-local-tokenizers.ts --probe compares the provider's
// own prompt_tokens against every family's local count over three unlike
// samples. See the map page's "Probing an unknown model" section.
// Anchored to the whole model ID, not a substring: a codename carries no
// generation information, so a successor like `big-pickle-v2` must be probed on
// its own rather than silently inheriting this mapping.
const DEEPSEEK_V3_CODENAMES = /(?:^|[:/])big-pickle$/i;

function isDeepSeekV3(modelId: string): boolean {
  if (DEEPSEEK_V3_CODENAMES.test(modelId)) return true;
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
  // Nemotron *3* is the exception to the Nemotron rule below: it counts exactly
  // as Tekken despite the NVIDIA branding. Wire-measured, not inferred — the
  // nano-30b, super-120b and ultra-550b checkpoints all matched on all three
  // probe samples with a 49-token margin, reproduced across three independent
  // providers (nvidia, openrouter, zen). The `-omni` multimodal variants are
  // deliberately left out: they land one token off on the symbolic sample, the
  // same way on both providers serving them, so they are a near neighbour
  // rather than a member. Later generations (3.5+) are unmeasured, so the
  // exclusion below still owns them.
  if (/nemotron-3-(nano|super|ultra)/.test(id) && !/omni/.test(id)) return true;
  // Every other NVIDIA Nemotron / anything under nvidia/ is Llama-family, NOT
  // Mistral — despite the "nemo" substring. (`nv-mistralai/mistral-nemo-*` is
  // real Mistral Nemo and is intentionally not caught here.)
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

/**
 * Resolves, in order: GPT-OSS, DeepSeek V4, DeepSeek V3, Llama 3.x, GLM-4,
 * Mistral Tekken. Everything else returns null and falls back to the generic
 * tiktoken estimate — including legacy Llama/Mistral (SentencePiece), which stays
 * unimplemented because it folds cleanly into that fallback.
 */
export function resolveTokenizerFamily(modelId: string): TokenizerFamily | null {
  if (isGptOss(modelId)) return GPT_OSS_FAMILY;
  if (isDeepSeekV4(modelId)) return DEEPSEEK_V4_FAMILY;
  if (isDeepSeekV3(modelId)) return DEEPSEEK_V3_FAMILY;
  if (isLlama3(modelId)) return LLAMA3_FAMILY;
  if (isGlm4(modelId)) return GLM4_FAMILY;
  if (isMistralTekken(modelId)) return MISTRAL_TEKKEN_FAMILY;
  return null;
}
