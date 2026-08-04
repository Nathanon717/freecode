# Dead code — zen:mimo-v2.5-free

111 files · 103 ok · 6 dead · 2 unparsed · 2m26s

## src/agent/tools/index.ts — UNPARSED

(empty response)

## src/cli/command-dispatcher.ts — UNPARSED

Looking at the exports and the reference table:

**`CommandDispatchResult`** (line 23): The return type of `dispatchCommand`, but the reference table confirms **0 code references outside this file** (docs mentions are descriptions, not uses). `src/cli/session-runner.ts` imports `dispatchCommand` but never imports `CommandDispatchResult` — callers rely on the inferred return type. The `'exit'` variant of the union is also never actually returned by `dispatchCommand`, which only ever returns `'continue'`.

All other exports (`ModelListMode`, `CommandRuntime`, `dispatchCommand`) are referenced externally. All local functions, imports, and branches are reachable.

- [unexport] `CommandDispatchResult` — type used only internally as `dispatchCommand`'s return annotation; zero imports outside the file, and the `'exit'` member is never returned by any code path.

## src/cli/render/transcript-renderer.ts

- [unexport] `renderToolStep` — 0 code references outside this file; only called internally by `renderTurn` at line 394. The comment claiming it is used by `commands/renderer.ts` is stale — no such reference appears anywhere in code.

## src/cli/tools/tool-invocation.ts

- [unexport] `toolCallSlots` — exported but has 0 references outside this file; only consumed internally by `nextToolFieldCaret` and `toolFieldBackspace`, both of which are themselves exported and used elsewhere. The `export` keyword can be removed.

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] `OpenAICompatQuirks` (interface, line 14) — exported but has zero import references outside this file; only used as the internal type annotation for `providerQuirks`, so callers never need the name. The docs hits are descriptions, not uses.

## src/providers/model-data.ts

- [unexport] `ObservedRateLimits` — zero code references outside this file; only used inside the `ModelEntry` interface on line 48, and in `docs/` (documentation, not use).
- [unexport] `CatalogModel` — zero code references outside this file; only used inside `saveProviderCatalog` and `getProviderCatalog` signatures/locals (lines 224, 244, 245), and in `docs/` (documentation, not use).

## src/providers/pricing-verifier.ts

- [unexport] `LITELLM_PRICING_URL` — only referenced inside this file (line 20); no external importer.
- [unexport] `OPENROUTER_MODELS_URL` — only referenced inside this file (line 35); no external importer.
- [unexport] `getLiteLLMRates` — only referenced inside this file (line 99); no external importer.
- [unexport] `getOpenRouterRates` — only referenced inside this file (line 99); no external importer.
- [unexport] `getVerifiedRates` — only referenced inside this file (lines 116, 121) by the two model-specific helpers; no external importer.

## src/util/errors.ts

- [unexport] `isNoSuchToolError` — exported but no references outside this file; only used internally by `rejectedToolCall` on line 226.
- [unexport] `noSuchToolName` — exported but no references outside this file; only used internally by `rejectedToolCall` on line 227.
- [unexport] `noSuchToolAvailableList` — exported but no references outside this file; only used internally by `rejectedToolCall` on line 228.
- [unexport] `isInvalidToolArgumentsError` — exported but no references outside this file; only used internally by `rejectedToolCall` on line 238.
- [unexport] `invalidToolName` — exported but no references outside this file; only used internally by `rejectedToolCall` on line 239.

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 2.6s · max 9.6s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

