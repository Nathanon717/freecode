# Dead code — mistral:ministral-3b-2512

111 files · 103 ok · 8 dead · 86 recovered · 1m25s

## src/cli/menus/menu-shell.ts _(verdict recovered from a malformed answer)_

- [unexport] MenuShellOptions — The interface is used internally in `runMenuShell` but no external code references it (only documentation).

## src/cli/render/markdown-renderer.ts _(verdict recovered from a malformed answer)_

- [dead] `tableConfirmed` — Only used in a branch guarded by `tableLines.length > 0 && !tableConfirmed` (line 250), which is never taken because `tableLines` is never empty when `tableConfirmed` is false (line 248–250). The guard is redundant and dead code.
- [dead] `tableLines` (line 245) — Only used in a branch guarded by `tableLines.length > 0` (line 248), which is never taken because `tableLines` is never empty when `tableConfirmed` is false (line 248–250). The branch is unreachable.
- [dead] `codeLang` (line 240) — Only used in `flushCode()` (line 242), which is guarded by `inCode` (line 240). The guard is always true when `inCode` is true, but `codeLang` is never read in that branch (line 242–243). The value is never used after assignment.
- [dead] `codeLines` (line 241) — Only used in `flushCode()` (line 242), which is guarded by `inCode` (line 240). The guard is always true when `inCode` is true, but `codeLines` is never read in that branch (line 242–243). The value is never used after assignment.
- [dead] `joinResults` (line 246) — Only used in `process()` (line 253), but the branch it guards (`a === null` or `b === null`) is never taken because `processLine` never returns `null` for non-table lines (line 253–254). The function is dead.
- [stale] `CODE_BLOCK_H_PAD` (line 1) — Comment asserts it’s a "breathing room" value, but the code never uses it outside `renderCodeBlock` (line 280), where it’s hardcoded as `2`. The comment is stale.

## src/cli/render/transcript-renderer.ts _(verdict recovered from a malformed answer)_

- [dead] `renderToolStep` — only used internally in this file (line 394), no external references

## src/commands/renderer.ts _(verdict recovered from a malformed answer)_

- [stale] `DEMO_OPTS` — Only used in a comment and never referenced elsewhere
- [dead] `writeContent` — Computed but never read (line 35)
- [dead] `markdownDemo` — Computed but never read (line 65)

## src/providers/adapters/openai-compat-quirks.ts _(verdict recovered from a malformed answer)_

- [unexport] `OpenAICompatQuirks` — Only used internally in the file’s own export, no external references.
- [dead] `parseMistralRateLimitSnapshot` — Imported but never called (only `parseCerebrasRateLimitSnapshot` and `groqHeadersToSnapshot` are used).
- [dead] `parseCerebrasRateLimitSnapshot` — Imported but never called.
- [dead] `groqHeadersToSnapshot` — Imported but never called.
- [dead] `stripTemperatureIfDisallowed` — Imported but never used (only `stripStreamForNonStream` and `injectCodestralSystem` are used).
- [dead] `stripStreamForNonStream` — Imported but never used (only `injectCodestralSystem` is used).
- [dead] `injectCodestralSystem` — Imported but never used.

## src/providers/provider-registry.ts _(verdict recovered from a malformed answer)_

- [dead] `LIVE_PROVIDER_IDS` — Only used in `initProviderModels` via `LIVE_PROVIDER_IDS.map`, but `initProviderModels` never actually calls `LIVE_PROVIDER_IDS` directly. The `entry` lookup in `initProviderModels` is the only path to `PROVIDER_REGISTRY`, and `LIVE_PROVIDER_IDS` is never referenced in that path.
- [dead] `initializedProviders` — Only used in `runLiveProviderInit` to guard against re-initialization, but the guard is redundant because `runLiveProviderInit` is called only once per provider ID and the `if (!initializedProviders.has(providerId))` check is already present. The `Set` is never modified after initialization.
- [dead] `initPromise` — Only used in `initDynamicProviders` to avoid re-initialization, but the guard is redundant because `initDynamicProviders` is called only once and `_doInit` is idempotent. The `Promise` is never reassigned after initialization.

## src/providers/user-blocklist.ts _(verdict recovered from a malformed answer)_

- [stale] `cached` — The `cached` variable is a local variable never exported, and its sole purpose is to cache the result of `getUserBlocklist()` for performance. The reference table does not list `cached` anywhere, but the file itself uses it, so it is live. However, the `resetUserBlocklistCache()` function is explicitly for testing and is used in tests, indicating that the cached state is intentionally managed externally for testing purposes. The `cached` variable is not dead.

## src/util/errors.ts _(verdict recovered from a malformed answer)_

- [stale] `isNoSuchToolError` — only documentation hit in `docs/map/util/errors.md`
- [stale] `noSuchToolName` — only documentation hit in `docs/map/util/errors.md`
- [stale] `noSuchToolAvailableList` — only documentation hit in `docs/map/util/errors.md`
- [stale] `isInvalidToolArgumentsError` — only documentation hit in `docs/map/util/errors.md`
- [stale] `invalidToolName` — only documentation hit in `docs/map/util/errors.md`

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.4s · max 8.5s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

