# src/tokenizers/model-family.ts - Tokenizer Family Resolver

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Resolves a model ID string to the tokenizer backend family that should count its tokens exactly. One named predicate per family (mirrors `providers/model-quirks.ts`), matched against the active `providerId:modelId` string — not a static per-model field, since most providers fetch their model lists live at runtime.

## Read When

- Adding a new exact tokenizer backend: add its predicate (and, for an HF fast-tokenizer family, its `HF_TOKENIZER_REPO` entry) here, matched against real fetched model ID strings (pull a live dump via the registry / `model-cache.json` first — providers use different ID conventions).
- Deciding whether some model belongs to a family already implemented here: don't reason from its name. Repo-hash it if it has a repo, and `--probe` it if it doesn't — see "Probing an unknown model".
<!-- END GENERATED MAP INTENT -->

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

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`tokenizers/count.ts`](count.md) ×13, [`tokenizers/download-tokenizer.ts`](download-tokenizer.md) ×2

## Tests

`tests/tokenizers/model-family.test.ts`.

## Budget

133 / 500 lines (367 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `resolveTokenizerFamily` resolves, in order: GPT-OSS (regex on `gpt-oss`, matched against real fetched model IDs across Groq/OpenRouter/NVIDIA/Cerebras), DeepSeek V4, DeepSeek V3, Llama 3.x, GLM-4, Mistral Tekken — everything else falls back to the generic tiktoken estimate. Legacy Llama/Mistral (SentencePiece) stays unimplemented (folds cleanly into the fallback).
- `HF_TOKENIZER_REPO`: the family→canonical-HF-repo-ID map consumed by `count.ts`'s `preloadTokenizerFor` and `download-tokenizer.ts`. Every entry was verified live against the HF API (content-hash compared across sibling model versions) before being committed — not guessed from model names. See "Verification trail" below before trusting or extending this map. Tekken is deliberately **not** in this map — it fetches a different repo file (`tekken.json`), so its repo/filename constants (`MISTRAL_TEKKEN_REPO`, `TEKKEN_FILENAME`) sit alongside it and `count.ts` loads it through `backends/tekken.ts`.
- **`isMistralTekken` covers the modern Mistral line** (NeMo-era and newer: Ministral, Mistral Small 3.x/4, Magistral, Devstral, modern Codestral, Pixtral, Mistral Medium 3.x, `mistral-vibe-cli`, `mistral-large-2512`/`-3`, and proprietary `mistral:` API models). Built ID-by-ID against the live catalog with hard excludes first, because the naming has landmines: anything under `nvidia/` is Llama-family despite the "nemo" substring, **except the Nemotron 3 line, which really is Tekken** (see the findings table below — measured, not inferred; the `-omni` variants and every other Nemotron generation stay excluded); Mixtral / Mistral-7B / first-gen Codestral / any `-v0.x` are legacy SentencePiece; `-embed`/`-ocr`/`-moderation`/`voxtral`/`saba` are non-chat; and `mistral-large-2407`/`-2411` predate Tekken (they ship `tokenizer.json` + SentencePiece, no `tekken.json`). One canonical repo covers the whole line — Nemo (v3) and Magistral (v11) have byte-identical used-vocab (verified 2026-07-06).
- **Kimi K2 is deliberately unmapped.** The plan assumed a "converted `tokenizer.json`" existed; live-checking `moonshotai/Kimi-K2-Instruct` and every variant/mirror repo (K2-Thinking, K2.5/2.6/2.7, unsloth, mlx-community) found none — Moonshot ships only a raw `tiktoken.model` ranks file plus a custom `tokenization_kimi.py` loader. That's tiktoken-family machinery (same shape as Mistral Tekken), not this HF-fast-tokenizer backend. Deferred, not silently dropped — surfaced to the user rather than left unmapped without explanation.
- **DeepSeek splits into two families, not one — but they share a BPE.** V3/V3.1/V3.2/R1 use `deepseek-ai/DeepSeek-V3`; V4-Pro/V4-Flash use `deepseek-ai/DeepSeek-V4-Pro`. The V4 file has a different content hash and is ~1.5MB smaller, but that difference is **not** a retrained vocab: `model.vocab` (128000 entries), `model.merges` (127741), `pre_tokenizer`, `normalizer`, `decoder` and `post_processor` all hash byte-identically between the two, with zero token-ID differences. The entire delta is `added_tokens` — 818 in V3 vs 1283 in V4, the 465 extras being IDs 128815-129279 (`<think>`, `<｜begin▁of▁file｜>`, `｜DSML｜`, repo/file markers). Keep them separate anyway: those added tokens are live during encoding, so `<think>` costs **3 tokens under V3 and 1 under V4**, which matters for reasoning-model transcripts. On text with no special-token literals the two are *numerically identical* and no measurement can tell them apart — see "Probing an unknown model" below. `deepseek-r1-distill-*` models are excluded from both — they're fine-tunes distilled onto a different base model's tokenizer (Llama/Qwen), which this resolver doesn't try to guess.
- **GLM-4 covers only the verified 4.5-4.7 main line** (including `-air`/`-v` vision variants, confirmed identical tokenizer content hash across `GLM-4.5-Air`/`GLM-4.6`/`GLM-4.7`/`GLM-4.5V`/`GLM-4.6V`). `-flash` variants and pre-4.5 releases (e.g. `glm-4-9b-chat`) use a different tokenizer and are excluded.

## Verification trail

Every repo/hash claim above was checked live against `https://huggingface.co/api/models/<repo>` and `resolve/main/tokenizer.json` response headers (`x-linked-etag`/`etag`) on 2026-07-01, not assumed from model names. Re-verify before extending this map to a new generation (e.g. a hypothetical DeepSeek V5, GLM-4.8) rather than widening a regex to guess it shares an existing family's tokenizer — a wrong-family exact count is worse than the safe fallback.

## Probing an unknown model

Every entry above except the codenames was established by comparing tokenizer files on the HF API. That doesn't work for a model with no published repo — an anonymized or codenamed one like `zen:big-pickle`. For those, `scripts/diagnostics/verify-local-tokenizers.ts --probe` measures the family off the wire instead:

- It sends two requests that are byte-identical except that the second appends a sample, so `promptTokens(B) - promptTokens(A)` is exactly what the sample cost — all chat-template and system-prompt overhead cancels. (Same differential trick the non-`--probe` mode uses; see that script's header.)
- It compares that delta against **every** family's local count, over three deliberately unlike samples (ASCII/code, multilingual, symbolic). One sample is not enough: gpt-oss, llama-3 and glm-4 all charge exactly 157 for the ASCII block and only separate on the other two. A family is reported only if it matches on all three.
- `--probe --dry-run` prints the separation matrix with no API calls. **Run it first** — it is the free go/no-go, and it is where indistinguishable pairs declare themselves.
- `--rounds N` repeats the measurement and takes each sample's modal delta. Providers that load balance (zen) can answer identical requests from upstreams that report usage differently; without rounds you score whichever upstream you happened to hit.
- `--model <substr>` in probe mode **widens** the target set to all free models, not just unmapped ones, so a model whose family is already known can be pushed through as a positive control. Always run one: an identification is only as trustworthy as the control that recovers a known answer.

Results are written to `scripts/diagnostics/tokenizer-family-probe.txt`.

**Wire-measured entries are a weaker evidence class than repo-hashed ones.** A repo hash proves two models ship the same tokenizer file; a wire measurement proves one provider's endpoint *counted* like a family on the samples tried. It cannot see a vocab difference the samples never exercise, and it attests to that endpoint, not to the model everywhere it is served. Mark which is which when adding an entry.

### Findings (2026-08-06)

| Model | Result | Evidence |
| --- | --- | --- |
| `zen:big-pickle` | **deepseek-v3** | Exact on all three samples (165/168/193), margin 14 over the nearest other family; tie-break below. Corroborated independently by `docs/bug log/06-08-2026.md`, where it fails 8/8 on DeepSeek's `reasoning_content` rule. |
| `zen:deepseek-v4-flash-free` | deepseek-v4 (control) | Recovered its known family exactly — this is what makes the row above reportable. |
| Nemotron 3: `nemotron-3-nano-30b-a3b`, `-super-120b-a12b`, `-ultra-550b-a55b` | **mistral-tekken** | Exact on all three samples (180/180/283), margin 49, reproduced on three independent providers (`nvidia`, `openrouter`, `zen`). This contradicted the old "all Nemotron is Llama-family" assumption, which is why the exclusion is now generation-scoped. |
| `nemotron-3-nano-omni-*-reasoning` | **not** tekken | 180/180/**282** — one token off on the symbolic sample, identically on both providers serving it. A reproducible 1-token gap is a different tokenizer, not noise, so the omni variants are excluded. |
| `zen:mimo-v2.5-free`, `zen:north-mini-code-free`, `zen:laguna-s-2.1-free`, `zen:longcat-2.0-free` | no known family | Expected: they really are families with no backend here. Nearest miss recorded in the results file. |
| `zen:ling-3.0-flash-free` | unreachable | Provider 404s it: "This model is unavailable for free… use `inclusionai/ling-3.0-flash`". A stale catalog entry, unrelated to tokenizers. |

One catalog ID is left unmapped on purpose: `nvidia/nemotron-nano-3-30b-a3b` looks like an alias of the measured `nemotron-3-nano-30b-a3b` (same size and MoE shape, words transposed), but "looks like" is exactly the inference this page tells you not to make. Probe it before adding it.

**Separating DeepSeek V3 from V4 needs the tie-breaker.** Their base BPE is byte-identical, so no ordinary text can tell them apart — the probe reports both and says `INDISTINGUISHABLE`. What does separate them is writing V4's *added* tokens literally: `<think>` costs 3 tokens under V3 and 1 under V4. The probe runs that sample only when a tie needs breaking. `big-pickle` charged 552 where V3 predicts 552 and V4 predicts 201; the known-V4 control charged 201. That control matters — had it also charged 552, the measurement would have been telling us the serving stack ignores added tokens rather than anything about the vocab.

## Key Neighbors

- [count.md](count.md): sole consumer; looks up the resolved family in its encoder cache, and reads `HF_TOKENIZER_REPO` to drive `preloadTokenizerFor`'s download step.
- [backends/tiktoken.md](backends/tiktoken.md): the GPT-OSS family's encoder.
- [backends/bpe-json.md](backends/bpe-json.md): the encoder every `HF_TOKENIZER_REPO` family loads into.
- [backends/tekken.md](backends/tekken.md): the encoder the `MISTRAL_TEKKEN_FAMILY` loads into.
- `providers/model-quirks.ts`: same one-predicate-per-case pattern, different concern (request-body quirks, not tokenizer selection).

## Update Triggers

Add a predicate whenever a model family gets an exact tokenizer backend. Don't add per-model-ID special cases — group by family the same way the backend/download logic does. Re-verify (don't assume) tokenizer identity before widening an existing family's regex to cover a new model generation.
