# src/tokenizers/model-family.ts - Tokenizer Family Resolver

**Role:** Resolves a model ID string to the tokenizer backend family that should count its tokens exactly. One named predicate per family (mirrors `providers/model-quirks.ts`), matched against the active `providerId:modelId` string — not a static per-model field, since most providers fetch their model lists live at runtime.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type TokenizerFamily = string;

GPT_OSS_FAMILY: 'gpt-oss'

LLAMA3_FAMILY: 'llama-3'

DEEPSEEK_V3_FAMILY: 'deepseek-v3'

DEEPSEEK_V4_FAMILY: 'deepseek-v4'

GLM4_FAMILY: 'glm-4'

MISTRAL_TEKKEN_FAMILY: 'mistral-tekken'

MISTRAL_TEKKEN_REPO: 'mistralai/Mistral-Nemo-Instruct-2407'

TEKKEN_FILENAME: 'tekken.json'

HF_TOKENIZER_REPO: Partial<Record<string, string>>

resolveTokenizerFamily(modelId: string): string | null
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `resolveTokenizerFamily` resolves, in order: GPT-OSS (regex on `gpt-oss`, matched against real fetched model IDs across Groq/OpenRouter/NVIDIA/Cerebras), DeepSeek V4, DeepSeek V3, Llama 3.x, GLM-4, Mistral Tekken — everything else falls back to the generic tiktoken estimate. Legacy Llama/Mistral (SentencePiece) stays unimplemented (folds cleanly into the fallback).
- `HF_TOKENIZER_REPO`: the family→canonical-HF-repo-ID map consumed by `count.ts`'s `preloadTokenizerFor` and `download-tokenizer.ts`. Every entry was verified live against the HF API (content-hash compared across sibling model versions) before being committed — not guessed from model names. See "Verification trail" below before trusting or extending this map. Tekken is deliberately **not** in this map — it fetches a different repo file (`tekken.json`), so its repo/filename constants (`MISTRAL_TEKKEN_REPO`, `TEKKEN_FILENAME`) sit alongside it and `count.ts` loads it through `backends/tekken.ts`.
- **`isMistralTekken` covers the modern Mistral line** (NeMo-era and newer: Ministral, Mistral Small 3.x/4, Magistral, Devstral, modern Codestral, Pixtral, Mistral Medium 3.x, `mistral-vibe-cli`, `mistral-large-2512`/`-3`, and proprietary `mistral:` API models). Built ID-by-ID against the live catalog with hard excludes first, because the naming has landmines: NVIDIA **Nemotron** and anything under `nvidia/` are Llama-family despite the "nemo" substring; Mixtral / Mistral-7B / first-gen Codestral / any `-v0.x` are legacy SentencePiece; `-embed`/`-ocr`/`-moderation`/`voxtral`/`saba` are non-chat; and `mistral-large-2407`/`-2411` predate Tekken (they ship `tokenizer.json` + SentencePiece, no `tekken.json`). One canonical repo covers the whole line — Nemo (v3) and Magistral (v11) have byte-identical used-vocab (verified 2026-07-06).
- **Kimi K2 is deliberately unmapped.** The plan assumed a "converted `tokenizer.json`" existed; live-checking `moonshotai/Kimi-K2-Instruct` and every variant/mirror repo (K2-Thinking, K2.5/2.6/2.7, unsloth, mlx-community) found none — Moonshot ships only a raw `tiktoken.model` ranks file plus a custom `tokenization_kimi.py` loader. That's tiktoken-family machinery (same shape as Mistral Tekken), not this HF-fast-tokenizer backend. Deferred, not silently dropped — surfaced to the user rather than left unmapped without explanation.
- **DeepSeek splits into two families, not one.** V3/V3.1/V3.2/R1 share one tokenizer (`deepseek-ai/DeepSeek-V3`); V4-Pro/V4-Flash retrained the vocab (`deepseek-ai/DeepSeek-V4-Pro`, confirmed via a different content hash and a ~1.5MB-smaller file). `deepseek-r1-distill-*` models are excluded from both — they're fine-tunes distilled onto a different base model's tokenizer (Llama/Qwen), which this resolver doesn't try to guess.
- **GLM-4 covers only the verified 4.5-4.7 main line** (including `-air`/`-v` vision variants, confirmed identical tokenizer content hash across `GLM-4.5-Air`/`GLM-4.6`/`GLM-4.7`/`GLM-4.5V`/`GLM-4.6V`). `-flash` variants and pre-4.5 releases (e.g. `glm-4-9b-chat`) use a different tokenizer and are excluded.

## Verification trail

Every repo/hash claim above was checked live against `https://huggingface.co/api/models/<repo>` and `resolve/main/tokenizer.json` response headers (`x-linked-etag`/`etag`) on 2026-07-01, not assumed from model names. Re-verify before extending this map to a new generation (e.g. a hypothetical DeepSeek V5, GLM-4.8) rather than widening a regex to guess it shares an existing family's tokenizer — a wrong-family exact count is worse than the safe fallback.

## Read When

- Adding a new exact tokenizer backend: add its predicate (and, for an HF fast-tokenizer family, its `HF_TOKENIZER_REPO` entry) here, matched against real fetched model ID strings (pull a live dump via the registry / `model-cache.json` first — providers use different ID conventions).

## Key Neighbors

- [count.md](count.md): sole consumer; looks up the resolved family in its encoder cache, and reads `HF_TOKENIZER_REPO` to drive `preloadTokenizerFor`'s download step.
- [backends/tiktoken.md](backends/tiktoken.md): the GPT-OSS family's encoder.
- [backends/bpe-json.md](backends/bpe-json.md): the encoder every `HF_TOKENIZER_REPO` family loads into.
- [backends/tekken.md](backends/tekken.md): the encoder the `MISTRAL_TEKKEN_FAMILY` loads into.
- `providers/model-quirks.ts`: same one-predicate-per-case pattern, different concern (request-body quirks, not tokenizer selection).

## Update Triggers

Add a predicate whenever a model family gets an exact tokenizer backend. Don't add per-model-ID special cases — group by family the same way the backend/download logic does. Re-verify (don't assume) tokenizer identity before widening an existing family's regex to cover a new model generation.
