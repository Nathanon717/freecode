# Dead code — zen:deepseek-v4-flash-free

111 files · 92 ok · 15 dead · 3 error · 1 unparsed · 10m30s

## src/agent/loop.ts

- [dead] `!useParsedToolsFallback` in the `isToolsNotSupportedError` catch — the top of `streamWithRetry`'s loop breaks before the `try` whenever `useParsedToolsFallback` is true, and no path inside the `try` assigns it, so the catch can only ever see it false; remove the conjunct.

## src/agent/tools/index.ts — ERROR

The operation was aborted due to timeout

## src/agent/turn-messages.ts

- [dead] `textOf`'s string branch — the only call site passes `message.content` after `Array.isArray(message.content)` is checked, so `typeof content === 'string'` can never be true; drop that branch.

## src/cli/command-dispatcher.ts

- [dead] `getSelectedModel()` nullish coalescing in `sendToAgent` — `CommandRuntime.getSelectedModel()` is declared to return `string`, so `runtime.getSelectedModel() ?? ''` and `runtime.getSelectedModel() ?? undefined` never take the fallback; pass the string directly.

## src/cli/eval/custom-eval-menu.ts

- [dead] `failedChecks.length > 0` in `runEvalScenarios` — `allPassed` is defined as every assertion passing, so `!allPassed` already guarantees at least one failed assertion in `failedChecks`; the extra condition cannot be false when evaluated and can be deleted.
- [dead] `(model || "")` in `runEvalScenarios` — `model` is declared `string`, so the `|| ""` fallback never changes the value; all uses (`deadColonIdx`, `deadProviderId`, `deadModelId`, `setActiveModelFromString`, `appendEvalRun`) are no-ops and can be plain `model`.

## src/cli/eval/humaneval-menu.ts

- [dead] `RetryStatusInfo.name` / `RetryStatusInfo.label` — `makeRetryPrompter` only reads `info.targetMs` from the parsed retry-status JSON; `name` and `label` are never referenced anywhere in this file, so the local interface can be narrowed to `{ targetMs: number }`.

## src/cli/menus/list-menu.ts

- [dead] `tabIndex` negative guard — `tabIndex` is initialized with `Math.max(0, …)`, so `if (tabIndex < 0) tabIndex = 0;` can never be taken; the guard is unreachable.

## src/cli/menus/raw-picker.ts — ERROR

The operation was aborted due to timeout

## src/cli/render/transcript-renderer.ts

- [unexport] `renderToolStep` — exported but only used internally (line 394); zero references outside the file.

## src/cli/session-modes.ts — UNPARSED

(empty response)

## src/cli/tools/tool-invocation.ts

- [unexport] `ToolParam` — no references outside this file; only used in the type of `TOOL_PARAMS`, so the export keyword is unused.
- [unexport] `toolCallSlots` — no references outside this file; only called internally by `nextToolFieldCaret` and `toolFieldBackspace`, so it should not be exported.

## src/index.ts — ERROR

The operation was aborted due to timeout

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] `OpenAICompatQuirks` — Nothing outside this file references it (only docs mention it); the only code use is as the type of the exported `providerQuirks`, so the `export` keyword can be removed.

## src/providers/fake.ts

- [unexport] `FAKE_DEFAULT_MODEL_ID` — no code outside this file references it; the only code use is line 112 in `createPlaceholderFakeLanguageModel`, and the docs hit is documentation, not a use. Drop the `export`.

## src/providers/paid-guard.ts

- [stale] PAID_API_KEY_ENV_VARS — the JSDoc claims "src/index.ts reads this before the catalog loads", but the reference table shows no reference to `PAID_API_KEY_ENV_VARS` in `src/`; only tests reference it. The comment is stale and should be removed.

## src/providers/pricing-verifier.ts

- [unexport] LITELLM_PRICING_URL — exported but has 0 code references outside this file; only used internally at line 20. The docs/ mention is documentation, not a use.
- [unexport] OPENROUTER_MODELS_URL — exported but has 0 code references outside this file; only used internally at line 35. The docs/ mention is documentation, not a use.
- [unexport] getLiteLLMRates — exported but has 0 code references outside this file; only called internally at line 99. The docs/ mention is documentation, not a use.
- [unexport] getOpenRouterRates — exported but has 0 code references outside this file; only called internally at line 99. The docs/ mention is documentation, not a use.
- [unexport] getVerifiedRates — exported but has 0 code references outside this file; only called internally at lines 116 and 121. The docs/ mention is documentation, not a use.

## src/providers/provider-registry.ts

- [dead] `initializedProviders` — the Set and the `has`/`add` guard in `runLiveProviderInit` are unreachable: `_doInit` can only run once because `initDynamicProviders` memoizes it in `initPromise`, so no provider id can already be in the set when an init runs.
- [dead] `applyBlocklist`'s `exactBlocklist` default — the `= []` default is never exercised; both in-file call sites (`initZenModels` and `initProviderModels`) always pass a third argument, so the default path can be removed.

## src/providers/types.ts

- [unexport] `RateLimits` — exported but never referenced outside this file (0 code references); only used internally as the type of `ModelConfig.limits`. Remove the `export` keyword.

## src/util/errors.ts

- [unexport] `isNoSuchToolError` — exported, but no code outside this file references it; its only use is inside `rejectedToolCall` at line 226, so the `export` keyword can be dropped.
- [unexport] `noSuchToolName` — exported, but no code outside this file references it; its only use is inside `rejectedToolCall` at line 227.
- [unexport] `noSuchToolAvailableList` — exported, but no code outside this file references it; its only use is inside `rejectedToolCall` at line 228.
- [unexport] `isInvalidToolArgumentsError` — exported, but no code outside this file references it; its only use is inside `rejectedToolCall` at line 238.
- [unexport] `invalidToolName` — exported, but no code outside this file references it; its only use is inside `rejectedToolCall` at line 239.

## HTTP diagnostics

- requests: 111 for 111 files (transport-error×1 · 200×110)
- 429 responses: 0 total, of which 3 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.6s · max 13.0s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

### Terminal failures

```
   23.7s start   300.6s spent   1 requests  src/agent/tools/index.ts
  142.5s start   301.3s spent   1 requests  src/cli/menus/raw-picker.ts
  329.1s start   301.0s spent   1 requests  src/index.ts
```

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

