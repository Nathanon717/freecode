# Exact Per-Model Token Counting Plan

Build a standalone **tokenizer engine** at `src/tokenizers/`: a synchronous `countTokens(messages,
modelId)` giving exact BPE/SentencePiece counts for model families we can identify, with a generic
tiktoken-based estimate as fallback for anything unrecognized. Fully local — no API calls,
everything runs offline once a tokenizer file is cached.

**Scope boundary (important):** this task builds the engine *only*. It does **not** wire anything
into the footer. The old chars/4 estimator (`src/agent/token-count.ts`) and its footer `ctx` slot
are deleted outright and **not** rebuilt — see "Decisions" for why the whole estimate-into-footer
path is being ripped out rather than upgraded. The engine's real consumer is a separate follow-up,,
which is what re-introduces a footer surface on top of this engine. Until that task lands, the
engine has **no interactive consumer** and is validated by unit tests alone. That is expected, not
an oversight.

## Why

The user runs many open-weight models across many providers (GPT-OSS, Mistral, DeepSeek, GLM,
Kimi, Llama, and more) and wants a token count that's actually right for whichever model is
active, not one heuristic pretending to fit all of them. Research found the many model names collapse to a handful of **tokenizer backend formats**:

**Why the old footer path is deleted, not upgraded.** Investigation of the existing token-count
wiring found it was fundamentally fucky, not just inaccurate: the footer `ctx` slot was a single
global stomped by three unrelated writers (the chars/4 estimate, real post-turn `promptTokens`, and
eval-run totals), the estimate was only a snapshot of committed history (frozen while you type, so
it never reflected the message you were about to send), and — despite the code's apparent intent —
the real `promptTokens` set in `command-dispatcher.ts` was overwritten by a fresh estimate in
`afterAgentCall` before it ever rendered, so the footer only *ever* showed the estimate. Rather than
preserve any of that, the estimate and its `ctx` slot are removed entirely. The genuinely valuable
behavior — a number telling you how full your context is — is rebuilt properly, live and accurate,
by the separate live-counter task on top of this engine.

1. **HF fast tokenizer (`tokenizer.json`, byte-level BPE)** — covers Llama 3.x, DeepSeek V3/R1,
   GLM-4.x (where published), Kimi K2 (converted `tokenizer.json`). Biggest coverage win, one loader.
2. **tiktoken encodings** — GPT-OSS's `o200k_harmony` is a first-class entry in OpenAI's own
   `tiktoken` repo. Also serves as the generic fallback estimator (`cl100k`/`o200k`) for anything
   unmapped.
3. **Raw SentencePiece `.model`** — legacy Llama 1/2, legacy (pre-Tekken) Mistral. *Not built (see
   Phase 4): every such model also ships a `tokenizer.json`, so it falls back cleanly or folds into
   the HF-fast backend — a SentencePiece binding buys nothing.*
4. **Mistral Tekken (`tekken.json`)** — tiktoken-based under the hood but a non-standard file
   layout; no ready-made JS library. Reuses the tiktoken engine from (2) once the vocab/merges are
   parsed out of `tekken.json`. This is the modern-Mistral traffic, so it's the priority (Phase 4).

## Decisions (locked)

- **New area:** `src/tokenizers/`. Needs a new `docs/map/tokenizers/` set of pages (this is a new
  top-level source folder, not a file added to an existing mapped folder).
- **Public surface stays synchronous.** The engine's future consumer (the live-counter task) will
  call `countTokens` on a hot path — potentially **once per keystroke** while composing — so it must
  not block on network/disk. Design: resolve + download + compile a model's tokenizer
  **asynchronously in the background** when the active model changes (the live-counter task hooks
  `preloadTokenizerFor` into the existing `applyModelChange`/`setActiveModelFromString` flow in
  `session-modes.ts`; this task just exposes the async preload entry point, it does not wire it),
  cache the compiled encoder in memory keyed by **family**, not by model ID (many model IDs share
  one family). The synchronous count call reads whatever's in the in-memory cache; if the exact
  encoder for the current model isn't ready yet (first turn on a brand-new family, download in
  flight, offline, or family unrecognized), it falls back to the new tiktoken-based estimate —
  never blocks, never throws.
- **The chars/4 estimator is fully replaced, not kept.** The permanent fallback (for models with
  no exact family match) is `js-tiktoken`'s `o200k_base` (or `cl100k_base`) encoding — a real BPE
  tokenizer, just for the wrong model family, still meaningfully closer than a chars/4 heuristic.
  `src/agent/token-count.ts`'s current implementation is deleted in Phase 1; nothing from it
  survives past that phase.
- **No footer wiring; the `ctx` slot is ripped out.** This task does not feed any count into the
  footer. Phase 1 deletes `Conversation.getContextTokenCount()`, its two callers
  (`session-runner.ts`'s `readInput(...)` argument and `resetBottomPromptState` in
  `session-modes.ts`), and the `ctx` display in `footer-status.ts` (`lastTokenCount`,
  `setTokenCount`, the `"{n} ctx"` render, and the related footer-layout branches/tests). The eval
  menus' `setTokenCount` calls are being removed separately by the user and are not this task's
  concern — but if any still exist when Phase 1 runs, delete their `setTokenCount` calls too so the
  symbol can be removed cleanly. After Phase 1 the footer has no token count at all; the live-counter
  task re-introduces one.
- **Cache location:** downloaded tokenizer files live under `.freecode/tokenizers/<family>/...`
  (mirrors the `getStoreDir()` convention already used by `model-cache.json`). Gitignored.
  Download pattern mirrors `src/eval/humaneval-data.ts`'s `ensureX()`/injectable-`downloadFn`
  shape (recent precedent: "humaneval dataset now auto downloads when missing").
- **Family resolution is regex-on-model-ID, not a static per-model field.** Most providers in
  `provider-catalog.ts` are `modelsSource: "live"` (model lists fetched at runtime from
  Groq/OpenRouter/SiliconFlow/Mistral/etc.), so there is no fixed list of model IDs to hang a
  static field off of. Follow the existing `src/providers/model-quirks.ts` pattern: one named
  predicate/lookup per family, matched against whatever model ID string is active
  (`providerId:modelId`, already tracked as `lastModelStatus` in `footer-status.ts` and threaded
  through `setActiveModelFromString`).
  **Important:** regexes must be checked against real fetched model ID strings (pull a live dump
  via the registry / `model-cache.json` at the start of the phase that needs them), not guessed —
  OpenRouter/Groq/SiliconFlow use different ID conventions (e.g. `moonshotai/kimi-k2-instruct` vs
  a bare `kimi-k2-instruct`).
- **Out of scope:** `providers/anthropic-cost.ts`, `providers/quota/headers.ts`,
  `providers/openai-daily-spend.ts` — these already get exact numbers from real provider API
  responses/headers, not from this estimator. Don't touch them. Also out of scope:
  `providers/model-list-cache.ts`, `providers/model-data.ts`, `providers/db.ts` (unrelated
  persistence, only the `getStoreDir()` helper is reused).
- **Dependency names are not final until verified.** Re-check current npm package name, version,
  and maintenance status at the start of each phase that adds one — this space shifts. Candidates
  from research: `js-tiktoken` (tiktoken family + generic fallback estimator, and Phase 4's Tekken
  encoding), `@huggingface/tokenizers` (HF fast-tokenizer family).

## Phase instructions

After finishing a phase: mark it `✅ COMPLETE`, strip implementation details that later phases
won't need, add a short **Notes** entry for anything that changed from the plan, and run
`npm.cmd test` (build + docs:generate + e2e + unit tests) before moving on. Each phase must
leave `npm.cmd test` green.

## Phases

### Phase 1 — Foundation + generic fallback (replaces chars/4 entirely) ✅ COMPLETE

Built `src/tokenizers/` (`fallback-estimate.ts`, `model-family.ts`, `count.ts`), each with a
mirrored test file, backed by `js-tiktoken@1.0.21`'s `o200k_base` encoding. Deleted the chars/4
estimator and its footer `ctx` slot outright, with no rewiring (see git for the exact deleted call
sites). Map pages in `docs/map/tokenizers/` own the detailed contract; the notes below are only
what a later phase needs to know before building on this.

**What Phase 2+ must know:**

- **`TokenizerFamily = string`** (not a union of future family names) — each phase adds a predicate
  in `model-family.ts` without touching a shared type.
- **`count.ts` is cache/lookup/fallback wiring only, with no per-family encoder.** `encoderCache` is
  never populated and `preloadTokenizerFor` is a no-op this phase, so the cache-hit branch is
  unreachable until a phase registers a real backend into it. This is the trigger for Phase 2; see
  `docs/map/tokenizers/count.md`.
- **Any `js-tiktoken` `encode` call must pass empty special-token lists** (`encode(text, [], [])`).
  The default throws on text containing `<|endoftext|>`/`<|endofprompt|>`, which breaks the sync
  path's "never throws" invariant (pasted output containing those literals would crash the counter).
  `fallback-estimate.ts` does this; new tiktoken-based backends must too. Regression-tested.
- **No folder-level README** — `scripts/check-map.ts` requires a 1:1 source↔page mapping, matching
  the `agent/tools/`, `providers/adapters/`, `providers/quota/` precedent.

Ends with `npm test` green.

### Phase 2 — tiktoken family (GPT-OSS) ✅ COMPLETE

Built `src/tokenizers/backends/tiktoken.ts` and `chat-format.ts`, wiring GPT-OSS as the first
family resolved into `count.ts`'s encoder cache. Map pages in `docs/map/tokenizers/` own the
details; the notes below are only what a later phase needs to know.

**What Phase 3+ must know:**

- **`chat-format.ts` is the shared per-message overhead formula**, extracted from
  `fallback-estimate.ts` so the fallback and every backend apply one overhead constant. New
  backends bind their encoder to its `countContextTokens` (as `createTiktokenEncoder` does).
- **`createTiktokenEncoder(encoding)` is a generic `Tiktoken → TokenizerEncoder` wrapper** (not
  GPT-OSS-specific). Phase 4 (Mistral Tekken) reuses it once `tekken.json`'s vocab/merges are
  parsed into a `js-tiktoken` encoding.
- **No download or cache dir is used by this backend** — GPT-OSS reuses `js-tiktoken`'s bundled
  `o200k_base` ranks. Phase 3/4 are the first to actually fetch/cache under `.freecode/tokenizers/`.
- **GPT-OSS's count is currently numerically identical to the fallback** (the harmony template's
  wrapper-token cost isn't modeled; only the flat overhead constant is). It's classified "exact"
  for cache wiring only. Relevant to Phase 5's "fallback reached only for unmapped models" check —
  see `docs/map/tokenizers/backends/tiktoken.md`'s "Known inaccuracy" section.

Ends with `npm test` green.

### Phase 3 — HF fast-tokenizer family (`tokenizer.json`) ✅ COMPLETE

Built `src/tokenizers/backends/bpe-json.ts` and `src/tokenizers/download-tokenizer.ts`, wiring
Llama 3.x, DeepSeek V3, DeepSeek V4, and GLM-4.5-4.7 into `count.ts`'s encoder cache via
`@huggingface/tokenizers@0.1.3`. Map pages in `docs/map/tokenizers/` own the details; the notes
below are only what a later phase needs to know, plus the deviations from the original plan text
found during live verification.

**Deviations from the plan (found via live HF API checks on 2026-07-01, not guessed):**

- **Kimi K2 is out of scope, not built.** The plan assumed a "converted `tokenizer.json`" existed
  somewhere. It doesn't: `moonshotai/Kimi-K2-Instruct` and every checked variant/mirror (K2-Thinking,
  K2.5/2.6/2.7, unsloth, mlx-community) ship only a raw `tiktoken.model` ranks file plus a custom
  `tokenization_kimi.py` — tiktoken-family machinery (same shape as Phase 4's Tekken), not this
  backend. Flagged to the user rather than silently dropped; a future phase could fold it into the
  tiktoken backend alongside or instead of Tekken.
- **DeepSeek is two families, not one.** V3/V3.1/V3.2/R1 share one tokenizer
  (`deepseek-ai/DeepSeek-V3`); V4-Pro/V4-Flash retrained the vocab entirely (different content hash,
  smaller file) → `DEEPSEEK_V3_FAMILY` and `DEEPSEEK_V4_FAMILY`, both loaded through the same
  `bpe-json.ts`. `deepseek-r1-distill-*` models are excluded from both (they reuse their distillation
  base model's tokenizer, not DeepSeek's own — unmapped is correct here, not a gap).
- **GLM-4 covers only the verified 4.5-4.7 main line.** Confirmed identical tokenizer content hash
  across `GLM-4.5-Air`/`GLM-4.6`/`GLM-4.7`/`GLM-4.5V`/`GLM-4.6V`. `-flash` variants and pre-4.5
  releases retrain the vocab and are excluded, not merged in.
- **Cache path is `.freecode/tokenizers/<family>/tokenizer.json`**, keyed by family (not
  `hf/<repo-slug>/` as originally sketched) — matches `count.ts`'s `encoderCache` key, and Phase 3
  only ever has one repo per family so no extra namespacing was needed.
- **The DeepSeek `tokenizer_config.json` gotcha turned out to be avoidable by construction**, not by
  special-casing: `@huggingface/tokenizers` builds `normalizer`/`pre_tokenizer`/`model`/`decoder`
  straight off `tokenizer.json`'s own fields and never reads `tokenizer_class` at all, so
  `loadBpeJsonEncoder` passes `{}` as the config argument for every family — `tokenizer_config.json`
  is never fetched for any of them.
- **Test fixtures are synthetic, not trimmed-real.** Real `tokenizer.json` files for these families
  are 6-20MB — too large to commit and, for BPE, not safely trimmable without risking a different
  merge order. `tests/tokenizers/fixtures/mini-tokenizer.json` is a small hand-built real BPE
  tokenizer (Whitespace pre-tokenizer, 6-entry vocab) exercising the same code path
  (`@huggingface/tokenizers`' real BPE algorithm) without a production-size vocab. `download-tokenizer.test.ts`
  and `count.test.ts`'s HF-family preload test both use an injected/mocked `downloadFn` /
  `ensureTokenizerFile` — no test in this repo hits the real network. Note this means the *real*
  production files' pre-tokenizer (ByteLevel + Split sequences, not the fixture's plain Whitespace)
  is not exercised by the committed test suite — covered instead by the one-time manual verification
  below, not by a regression test.
- **All four real canonical files were manually verified end-to-end**, not just etag-checked: each
  of `NousResearch/Meta-Llama-3-8B`, `deepseek-ai/DeepSeek-V3`, `deepseek-ai/DeepSeek-V4-Pro`, and
  `zai-org/GLM-4.5-Air`'s real `tokenizer.json` was downloaded and run through `loadBpeJsonEncoder`
  on a real message pair, confirming no throw and a non-fallback count (220/227/227/220 vs. a 222
  fallback estimate on the same input) — proof the real ByteLevel/Split pre-tokenizer path parses
  and encodes correctly, not just the fixture's simpler Whitespace path. Also diffed DeepSeek
  V3/R1/V3.1's `model.vocab`/`model.merges` directly: byte-identical across all three (R1 only swaps
  2 placeholder `added_tokens` for `<think>`/`</think>`), confirming the "one tokenizer" family claim
  is earned, not assumed from matching etags alone.

**What Phase 4 must know:**

- `model-family.ts`'s `HF_TOKENIZER_REPO` is the family→canonical-repo-ID map; `count.ts`'s
  `preloadTokenizerFor` now does a real async ensure-download → load → cache sequence for any family
  present in that map (de-duped per family via a `pendingLoads` map), not just a synchronous
  bundled-encoder registration like GPT-OSS. Phase 4 (Tekken) needs its own encoder build, but
  `tekken.json` is fetchable via the same HF `resolve/main/<file>` route `download-tokenizer.ts`
  already uses — parameterize its hardcoded `tokenizer.json` filename rather than adding a parallel
  download path.
- See `docs/map/tokenizers/model-family.md`'s "Phase 3 verification trail" note before widening any
  existing family regex to a new model generation — every mapping here was checked against live HF
  API responses, not inferred from naming.

Ends with `npm.cmd test` green.

### Phase 4 — Modern Mistral Tekken family (priority) ✅ COMPLETE

Built `src/tokenizers/backends/tekken.ts` (`loadTekkenEncoder`), wiring the modern Mistral line
(`MISTRAL_TEKKEN_FAMILY`) into `count.ts`'s encoder cache. Tekken parses into plain vocab+ranks that
Phase 2's `createTiktokenEncoder` consumes directly — **no `mistral-common` preprocessing**, so this
was a clean exact-count job, not the feared scope-down to best-effort. Map pages in
`docs/map/tokenizers/backends/tekken.md` (+ `model-family.md`, `download-tokenizer.md`, `count.md`,
`tiktoken.md`) own the details; the notes below are only what Phase 5 needs.

**What Phase 5 must know:**

- **The load recipe lives in `backends/tekken.ts`.** Slice `vocab` to
  `default_vocab_size - default_num_special_tokens` (130072), emit js-tiktoken's `_ <rank> <base64>`
  bpe_ranks lines, build `new Tiktoken({ pat_str: config.pattern, special_tokens: {}, bpe_ranks })`.
  The **slice is load-bearing** (verified: js-tiktoken's counts match Mistral's own canonical
  `tokenizer.json` exactly on 7/7 samples only *with* the slice — the tokenizer.json diff via
  `@huggingface/tokenizers` was the oracle, since `mistral-common` won't build on Termux).
- **One repo covers the whole line** — Nemo (v3) and Magistral (v11) have byte-identical used-vocab.
  `MISTRAL_TEKKEN_REPO = mistralai/Mistral-Nemo-Instruct-2407`, fetched as `tekken.json` (not
  `tokenizer.json`) via `ensureTokenizerFile`'s new `filename` param.
- **`isMistralTekken` was built ID-by-ID against the live catalog, not a broad regex** — see
  `model-family.md`'s landmine list (Nemotron/`nvidia/` are Llama not Mistral; Mixtral/7B/first-gen
  Codestral/`-v0.x` are legacy SentencePiece; `-embed`/`-ocr`/`-moderation`/`voxtral`/`saba` are
  non-chat; `mistral-large-2407`/`-2411` predate Tekken). Re-check the catalog before widening it.

**Notes (deviations from the pre-investigation plan):**

- **Magistral-Small-2506 is `v11`, not the guessed v13** — the version-label guesses in the original
  plan text were approximate; the byte-identical-vocab check is what actually earned "one repo."
- **Verified against Mistral's canonical `tokenizer.json`, not `mistral-common`.** `pip install
  mistral-common` compiles native deps (pydantic-core) and did not finish in a practical window on
  this Termux env; the HF-tokenizer.json diff is an equivalent oracle using already-installed deps.
- **The `isMistralTekken` predicate excludes two ambiguous cases conservatively** (fallback, not a
  possibly-wrong exact count): bare `mistral-large-latest` (which "latest" points at drifts) and the
  `mistral-code-*` API models (Codestral-based but unconfirmed). Widen later if the server-diff
  confirms them.
- **Proprietary `mistral:` API models are covered by the shared vocab but not yet server-diff'd.**
  End-to-end smoke through the production path (`preloadTokenizerFor` → real `tekken.json` download →
  exact `countTokens` diverging from the fallback) passed for `mistral:mistral-small-2506`. The
  `scripts/verify-local-tokenizers.ts --model mistral` differential-vs-server delta against the live
  `mistral:` provider is deferred to Phase 5 as the ground-truth confirmation for the API-only models.

Ends with `npm.cmd test` green.

### Phase 5 — Cleanup and verification ✅ COMPLETE

Closed the Phase 4 deferral (the live Mistral server-diff) and confirmed the fallback is only
reached for genuinely unmapped models. The single code change was to `scripts/verify-local-tokenizers.ts`
(no `src/` change, so no map page needed one). `npm test` is green; `docs:generate` is clean.

**What was done:**

- **The verify script gained a Tekken branch.** `verify-local-tokenizers.ts`'s `loadExactEncoder`
  handled only GPT-OSS and the `HF_TOKENIZER_REPO` families — the Tekken family fell through to the
  `else` branch and threw "no configured HF tokenizer repo," so the whole modern-Mistral line was
  unmeasurable. Added a `MISTRAL_TEKKEN_FAMILY` case (`ensureTokenizerFile(..., TEKKEN_FILENAME)` →
  `loadTekkenEncoder`) mirroring the never-fallback contract of the other branches, and updated the
  header comment's family list. This was the actual gap blocking the deferred diff, not a side-note.
- **Fallback-only-for-unmapped confirmed via `--dry-run`** (load-success is the pass criterion, not
  count-difference — GPT-OSS is documented numerically identical to the fallback, so a
  count-difference check would false-flag it). All 53 selectable exact-tokenizer models across every
  family (gpt-oss, llama-3, deepseek-v4, glm-4, mistral-tekken; deepseek-v3 had no live selectable
  model but is Phase-3-verified) compiled their exact encoder with **zero `load-error`s**. The
  unmapped exclusions (Kimi, `*-distill`, `glm-*-flash`, pre-Tekken Mistral) are each documented
  with a reason in `model-family.ts` — unmapped on purpose, not gaps.
- **Live Mistral server-diff (the Phase 4 deferral) passed 12/12.** `verify-local-tokenizers.ts
  --model "mistral:"` against the live `mistral:` provider: every measured proprietary API model
  (`mistral-medium-2505/2508/2604`, `mistral-tiny-2407`, `codestral-2508`, `devstral-2512`,
  `mistral-large-2512`, `ministral-3b/8b/14b-2512`, `magistral-small-2509`, `mistral-small-2506`)
  matched Mistral's own `usage.promptTokens` delta **to the token**. The 2 unmeasured models were
  transient HTTP 504s (provider-side), not tokenizer mismatches. The Phase 4 note's "shared vocab
  but not yet server-diff'd" caveat for the API-only models is now retired.

**Notes:**

- No unit test was added for `count.ts`'s `loadTekkenFamily` glue: the backend
  (`backends/tekken.test.ts`) and the tekken.json download path (`download-tokenizer.test.ts`'s
  "non-default filename" case) are both covered directly, and `loadTekkenFamily` is a two-line wire
  identical in shape to the HF path already exercised by `count.test.ts`. Forcing a filename-conditional
  mock into `count.test.ts` for it would violate `docs/unit-tests.md`'s anti-bloat rule for no new
  coverage. (Judgment call, documented rather than silently skipped.)
- The `mistral:` provider is **not** flagged `paid` in `provider-catalog.ts` (only `openai`/`anthropic`
  are), so the script's paid-provider filter does not drop it — the Tekken branch alone was enough
  to surface the API models.
- Note for the live-counter task: whether to visually distinguish exact vs. estimated counts (e.g.
  a marker character) is an open UI decision that belongs to *that* task, since it owns the footer
  surface — not decided here.

Ends with `npm.cmd test` green.
