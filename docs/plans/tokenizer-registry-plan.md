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
3. **Raw SentencePiece `.model`** — legacy Llama 1/2, legacy (pre-Tekken) Mistral.
4. **Mistral Tekken (`tekken.json`)** — tiktoken-based under the hood but a non-standard file
   layout; no ready-made JS library. Build last, reusing the tiktoken engine from (2) once the
   vocab/merges are parsed out of `tekken.json`.

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
  footer. Phase 1 deletes `SessionController.getContextTokenCount()`, its two callers
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
  `registry-data.ts` are `modelsSource: "live"` (model lists fetched at runtime from
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
  `providers/model-cache.ts`, `providers/model-store.ts`, `providers/db.ts` (unrelated
  persistence, only the `getStoreDir()` helper is reused).
- **Dependency names are not final until verified.** Re-check current npm package name, version,
  and maintenance status at the start of each phase that adds one — this space shifts. Candidates
  from research: `js-tiktoken` (tiktoken family + generic fallback estimator), `@huggingface/tokenizers`
  (HF fast-tokenizer family), a SentencePiece WASM binding (candidates: `@sctg/sentencepiece-js`,
  `@agnai/sentencepiece-js` — pick one after checking it round-trips against a real model's
  Python-computed tokens, don't trust it blindly).

## Phase instructions

After finishing a phase: mark it `✅ COMPLETE`, strip implementation details that later phases
won't need, add a short **Notes** entry for anything that changed from the plan, and run
`npm.cmd test` (build + docs:generate + scenarios + unit tests) before moving on. Each phase must
leave `npm.cmd test` green.

## Phases

### Phase 1 — Foundation + generic fallback (replaces chars/4 entirely)

- Add `js-tiktoken` dependency (verify current package name/version first).
- Create `src/tokenizers/`:
  - `fallback-estimate.ts` — a fresh implementation backed by `js-tiktoken`'s `o200k_base` (or
    `cl100k_base`) encoding: `estimateContextTokens(messages): number` and whatever smaller
    building-block exports the call sites need. This is a real BPE tokenizer for the wrong model
    family — still meaningfully more accurate than chars/4, and it's the permanent fallback for
    any model with no exact family match, not a stopgap.
  - `model-family.ts` — resolver skeleton: `resolveTokenizerFamily(modelId: string): TokenizerFamily | null`.
    Every model returns `null` for now (no exact families implemented yet) — behavior in this
    phase comes entirely from the new fallback.
  - `count.ts` — new public surface: a synchronous `countTokens(messages, modelId): number` that
    checks an in-memory `Map<family, Encoder>` cache, falls back to `fallback-estimate.ts` when no
    family is resolved or no encoder is cached yet; and an async `preloadTokenizerFor(modelId): Promise<void>`
    that resolves the family and (for now, since no exact backends exist) is a no-op.
- Delete `src/agent/token-count.ts` outright and its map page. Delete
  `tests/agent/token-count.test.ts` (its chars/4 exact-count assertions — `hello`→2,
  `superlongword`→4, etc. — assert the old algorithm's arithmetic and don't carry over).
  Write fresh tests in `tests/tokenizers/fallback-estimate.test.ts` against the real tiktoken
  output, plus `tests/tokenizers/model-family.test.ts` and `tests/tokenizers/count.test.ts` (every
  new `src/tokenizers/**/*.ts` file needs its mirrored test file in this same phase, per
  `docs/README.md`'s mirroring rule — don't leave any until a later phase).
- **Rip out the estimate→footer path (no rewiring).** The engine has no interactive consumer in this
  task, so there are no count call sites to re-plumb — instead, delete the old ones:
  - Remove `SessionController.getContextTokenCount()` and its `estimateContextTokens` import.
  - Remove its two callers: the `session.getContextTokenCount()` argument to `mode.readInput(...)`
    in `session-runner.ts` (change `readInput`'s signature to take no token count), and the
    `setTokenCount(session.getContextTokenCount())` call in `resetBottomPromptState`
    (`session-modes.ts`).
  - Remove the `ctx` display from `footer-status.ts`: `lastTokenCount`, `setTokenCount`, the
    `${lastTokenCount} ctx` string, and every footer-layout branch that references `tokenStr`/
    `statusStr` (the quota-only rows change shape — update `layoutFooterRightRows` and its tests in
    `tests/cli/footer-status.test.ts` accordingly; the footer now shows quota + model + spend, no
    token count).
  - Drop the now-unused `setTokenCount` import from `terminal-ui.ts`, `session-modes.ts`,
    `command-dispatcher.ts` (its `setTokenCount(result.usage.promptTokens)` call goes too — that
    real number was never rendered anyway; it still flows to `FREECODE_RESULT_JSON` and the
    Anthropic cost line, both untouched), and any eval menu still importing it.
  - The async `preloadTokenizerFor` export exists but is called by nobody yet — that's expected; the
    live-counter task wires it. Don't add a caller here just to have one.
- Add `docs/map/tokenizers/README.md` + per-file map pages (`count.md`, `model-family.md`,
  `fallback-estimate.md`). Update `docs/map/agent/session-controller.md` (drop the token-estimation
  role) and any footer/terminal-ui map page that documents the `ctx` slot.
- `.gitignore`: add `.freecode/tokenizers/`.
- User-visible change: the footer no longer shows a token count at all. Update footer scenario/docs
  coverage to match (the live-counter task re-adds one later). This is intended.
- Ends with `npm.cmd test` green.

### Phase 2 — tiktoken family (GPT-OSS exact match)

- `src/tokenizers/backends/tiktoken.ts`: loads a named tiktoken encoding for exact family matches,
  starting with `o200k_harmony` for GPT-OSS (confirm whether `js-tiktoken` bundles it or whether
  its rank file needs fetching from `openai/tiktoken` and caching under
  `.freecode/tokenizers/tiktoken/`). This reuses the `js-tiktoken` dependency from Phase 1 but
  resolves an *exact* encoding tied to a specific family, distinct from the generic fallback.
- `model-family.ts`: add the GPT-OSS predicate (match against real live-fetched model ID strings
  for GPT-OSS across whichever providers serve it — check `registry-data.ts`/live dumps first).
- Tests: `tests/tokenizers/backends/tiktoken.test.ts` — exact known token counts for a few fixed
  strings against the real encoding; mirrors the new source file per `docs/README.md`.
- Ends with `npm.cmd test` green.

### Phase 3 — HF fast-tokenizer family (`tokenizer.json`)

Biggest model-coverage phase: Llama 3.x, DeepSeek V3/R1, GLM-4.x, Kimi K2.

- Add `@huggingface/tokenizers` dependency (verify current package name/API first — this is the
  Rust-core WASM/N-API port of HF's `tokenizers` library).
- `src/tokenizers/backends/bpe-json.ts`: given a cached `tokenizer.json` path, loads and returns an
  encoder with an `encode(text): number[]`-shaped API (or whatever the chosen library exposes).
- `src/tokenizers/download-tokenizer.ts`: given a canonical HF repo ID, fetches
  `https://huggingface.co/<repo>/resolve/main/tokenizer.json` if not already cached under
  `.freecode/tokenizers/hf/<repo-slug>/tokenizer.json`. Mirror `humaneval-data.ts`'s
  injectable-`downloadFn` shape for testability.
- `model-family.ts`: add one predicate + canonical HF repo ID per family (not per model name —
  e.g. one Llama-3 repo ID covers all Llama 3.x finetunes that didn't retrain the tokenizer).
  Verify each canonical repo actually has a `tokenizer.json` before committing to it as the
  source, especially for GLM and Kimi K2 where it's published in some repos but not guaranteed
  universally.
- **DeepSeek gotcha:** `tokenizer_config.json` in DeepSeek repos declares
  `"tokenizer_class": "LlamaTokenizerFast"`, which (per a live HF `transformers` bug,
  huggingface/transformers#45488) makes some loaders install a Metaspace pre-tokenizer that drops
  spaces, because DeepSeek's actual vocab has no SentencePiece `▁` markers. Load the raw
  `tokenizer.json` directly through whatever low-level API the chosen library exposes; do not go
  through any "auto-detect from config" convenience wrapper for DeepSeek.
- Tests: known-token-count fixtures per family, loaded from the actual cached `tokenizer.json`
  (small real file, or a trimmed fixture if the real file is too large to fixture in-repo — decide
  based on file size). Mirror every new source file (`bpe-json.ts`, `download-tokenizer.ts`) with
  its own test file per `docs/README.md`.
- Ends with `npm.cmd test` green.

### Phase 4 — SentencePiece family (legacy Llama 1/2, legacy Mistral)

- Pick a SentencePiece WASM binding (see candidates above) after checking maintenance status and
  verifying it reproduces known token counts for a real model's `.model` file.
- `src/tokenizers/backends/sentencepiece.ts`, same load-from-cache-or-download shape as Phase 3.
  Mirror it with a test file per `docs/README.md`.
- `model-family.ts`: predicates for Llama 1/2 and pre-Tekken Mistral (v1/v2/v3).
- Lower priority than Phases 2–3 — most of the user's actual traffic is on newer models. Can be
  deferred or dropped if the chosen binding proves unreliable; fallback estimator covers it either way.
- Ends with `npm.cmd test` green.

### Phase 5 — Mistral Tekken family

- Investigate `tekken.json`'s actual structure (fetch one, e.g. from a Mistral NeMo/Small/Large
  repo) to confirm whether it's parseable into plain vocab+merges that Phase 2's tiktoken engine
  can consume directly, or whether it needs `mistral-common`-equivalent logic beyond that.
- `src/tokenizers/backends/tekken.ts`: parses `tekken.json`, feeds Phase 2's tiktoken backend.
  Mirror it with a test file per `docs/README.md`.
- `model-family.ts`: predicate for Tekken-era Mistral models (NeMo, Pixtral, Small, Large — verify
  against real live-fetched Mistral model IDs).
- Hardest/most exploratory phase — if `tekken.json`'s format turns out to require the full
  `mistral-common` preprocessing pipeline (not just vocab/merges), this phase may need to be
  scoped down to "best-effort approximate Tekken count via the fallback estimator" instead of exact.
- Ends with `npm.cmd test` green.

### Phase 6 — Cleanup and verification

- Confirm the fallback estimate is now only reached for genuinely unmapped models, not families
  that should have exact loaders.
- There is **no interactive surface to pty-check in this task** — the footer shows no token count
  yet. Validation is by unit tests: exact known counts per family (`tests/tokenizers/**`), and the
  background-preload/cache behavior (family resolved, encoder compiled and cached, sync count reads
  it; unresolved/in-flight/offline falls back without throwing). If you want a live smoke test of
  the engine before the live-counter task exists, add a throwaway script under the scratchpad dir
  (not committed), don't wire a temporary footer readout.
- Note for the live-counter task: whether to visually distinguish exact vs. estimated counts (e.g.
  a marker character) is an open UI decision that belongs to *that* task, since it owns the footer
  surface — not decided here.
- Final `npm.cmd test` green, `npm run docs:generate` clean, `git diff --name-only` reviewed for
  map pages needing updates.
