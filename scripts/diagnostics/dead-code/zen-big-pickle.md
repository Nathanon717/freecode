# Dead code — zen:big-pickle

111 files · 93 ok · 16 dead · 2 unparsed · 8m25s

## src/agent/loop.ts — UNPARSED

(empty response)

## src/agent/tools/index.ts

- [stale] `wrap` — its comment says spawn_agent “skips confirmation (like the read-only tools)”, but `READ_ONLY_TOOL_DEFS` are wrapped through `wrapAll` → `wrap` without the `requiresConfirmation` argument, so it defaults to `true` and read-only tools go through `withConfirmation` and call `confirmToolCall`. Only `spawn_agent` passes `false`. The parenthetical is false and should be deleted.

## src/agent/tools/list-dir.ts

- [dead] `size` — In `execute`, each `stat` result is mapped to an object including `size`, but `size` is never read afterward: `dirs`/`files` use only `name` and `isDirectory`, and the tool returns a string. The `size` property (and its `size: 0` fallback) can be deleted.

## src/cli/chrome/bottom-ui.ts

- [dead] timer branch in `setupFooterUI` — `if (inputUIActive && footerRowCount !== prevFooterRowCount) drawInputArea();` is unreachable. Every path that makes `inputUIActive` true (`setupInputUI`) immediately normalizes via `drawFooter()`, and `composeFooterOutput()` with input active uses `maxRows = 2`; resize also resets `footerRowCount` to 2, so the comparison can never be true in the timer.
- [stale] `drawFooter` comment — it says “Draws the two footer rows (r-1 blank, r status line)”, but the function now renders `composeFooterOutput()`, which can emit 3 rows and puts the toggle/secondary-right content on row r-1.

## src/cli/eval/custom-eval-menu.ts

- [stale] buildCustomEvalTab top comment — “Selecting Run closes the menu via `choose(scenarios)`” no longer matches the code: the Run action calls `choose([scenarios[ctx.getSelected()]])`, while `choose([...scenarios])` is only used for the `a`/`A` key. The comment should be updated or removed.

## src/cli/menus/list-menu.ts

- [dead] `if (tabIndex < 0) tabIndex = 0;` — unreachable: `tabIndex` is initialized with `Math.max(0, ...)`, so it can never be negative.

## src/cli/render/transcript-format.ts

- [dead] `TOOL_DISPLAY_NAMES` — the record is defined empty, so `displayName`’s `TOOL_DISPLAY_NAMES[name] ?? name` can never resolve to anything but `name`; the map and its lookup are inert and can be deleted.

## src/cli/render/transcript-renderer.ts

- [dead] `DiffEntry` re-export — the only repository occurrences are in `src/util/line-diff.ts`; nothing imports it from this file and the file itself never uses it.
- [dead] `formatParsedToolCallLine` re-export — the only non-this-file occurrence is its definition in `transcript-format.ts`; the call in `writeToolCallHeader` uses the top-level import, so the re-export has no consumer.
- [dead] `formatRationaleLine` re-export — same: the only outside occurrence is its definition; the use in `writeToolCallHeader` is via the module import, not the re-export.
- [unexport] `renderToolStep` — no references outside this file; it is called only from `renderTurn` at line 394, so remove the `export` keyword.

## src/cli/tools/tool-invocation.ts

- [unexport] `ToolParam` — no code outside this file references it; it is only used internally as the element type of the exported `TOOL_PARAMS`, so the export is unnecessary.
- [unexport] `toolCallSlots` — no code outside this file references it; it is used only by `nextToolFieldCaret` and `toolFieldBackspace` in this file.
- [dead] `m.index ?? 0` in `toolNameHighlightRanges` — `line.matchAll` yields `RegExpExecArray`, whose `index` is typed non-nullable, so the fallback is unreachable.

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] OpenAICompatQuirks — nothing outside this file references it (0 code references in the table); the file itself only uses it as the type of `providerQuirks` on line 23, so the `export` keyword can be dropped while keeping the interface.

## src/providers/fake.ts

- [unexport] `FAKE_DEFAULT_MODEL_ID` — exported but no code outside this file references it (only docs mention it); its sole use is line 112 inside `createPlaceholderFakeLanguageModel`, so the `export` keyword can be removed while the constant stays.

## src/providers/model-data.ts

- [unexport] `ObservedRateLimits` — the interface is used only inside this file (`ModelEntry.rateLimits`) and the reference table shows 0 code references outside it, so the `export` keyword can be removed while the declaration stays.

## src/providers/pricing-verifier.ts

- [unexport] `LITELLM_PRICING_URL` — no code outside the file references it; it is only used at line 20 inside the file.
- [unexport] `OPENROUTER_MODELS_URL` — no code outside the file references it; it is only used at line 35 inside the file.
- [unexport] `getLiteLLMRates` — no code outside the file references it; it is only used at line 99 inside the file.
- [unexport] `getOpenRouterRates` — no code outside the file references it; it is only used at line 99 inside the file.
- [unexport] `getVerifiedRates` — no code outside the file references it; it is only used at lines 116 and 121 inside the file.

## src/providers/provider-registry.ts

- [dead] `initializedProviders` — the `Set` and its `has`/`add` guard in `runLiveProviderInit` are unreachable: `initPromise` guarantees `_doInit` runs at most once, so no provider can ever be initialized twice. Remove the set and the guard.

## src/providers/quota/headers.ts

- [unexport] RateLimitBucket — exported but has zero references outside this file; its only use is as the element type of RateLimitSnapshot, which callers use directly, so the export modifier can be dropped.
- [dead] num — duplicate of the module-level headerNum helper; parseGroqRateLimitHeaders could call headerNum for its numeric fields, making the inner closure deletable.

## src/providers/types.ts

- [unexport] `RateLimits` — the only code reference is inside this file (`limits?: RateLimits`); no outside code references it, and the `docs/` hits are documentation, not uses. Remove the `export` keyword.

## src/util/errors.ts

- [unexport] `isNoSuchToolError` — exported but has zero code references outside this file; only used internally at line 226, and docs mention is not a use.
- [unexport] `noSuchToolName` — exported but has zero code references outside this file; only used internally at line 227, and docs mention is not a use.
- [unexport] `noSuchToolAvailableList` — exported but has zero code references outside this file; only used internally at line 228, and docs mention is not a use.
- [unexport] `isInvalidToolArgumentsError` — exported but has zero code references outside this file; only used internally at line 238, and docs mention is not a use.
- [unexport] `invalidToolName` — exported but has zero code references outside this file; only used internally at line 239, and docs mention is not a use.

## src/util/screen-buffer.ts — UNPARSED

(empty response)

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.3s · max 7.9s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

