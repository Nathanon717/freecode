# Dead code — mistral:mistral-small-2603

111 files · 87 ok · 24 dead · 4m11s

## src/agent/loop.ts

- [dead] `systemPromptLogged` — declared and assigned, but never read anywhere in the file or referenced outside.

## src/agent/parsed-tools.ts

- [dead] ParsedToolsResult — 0 code references outside this file and it is only used in an exported function's return type signature

## src/agent/subagents/run-subagent.ts

- [dead] SubAgentContext — 0 code references outside this file and the file itself uses it only in type positions or internal helper signatures; the exported type is never consumed externally.

## src/agent/workspace.ts

- [dead] `ResolvedProjectPath` — 0 code references outside this file and only used internally as a return type for exported functions.

## src/cli/chrome/footer-status.ts

- [dead] `formatDuration` — never referenced outside this file and not used internally
- [dead] `estimateBucket` — never referenced outside this file and not used internally
- [dead] `padNumberText` — never referenced outside this file and not used internally
- [dead] `padDurationText` — never referenced outside this file and not used internally
- [dead] `formatBucketStatus` — never referenced outside this file and not used internally
- [dead] `formatQuotaStatus` — never referenced outside this file and not used internally
- [dead] `formatOpenAIDailySpend` — never referenced outside this file and not used internally
- [dead] `formatContextStatus` — never referenced outside this file and not used internally
- [dead] `joinParts` — never referenced outside this file and not used internally

## src/cli/eval/humaneval-menu.ts

- [dead] `RunStatus` (type, line 139) — exported but never referenced outside this file
- [dead] `RunResult` (interface, line 141) — exported but never referenced outside this file
- [dead] `TranscriptTurn` (interface, line 145) — exported but never referenced outside this file
- [dead] `RetryStatusInfo` (interface, line 153) — exported but never referenced outside this file

## src/cli/menus/list-menu.ts

- [dead] ListMenuOptions — 0 code references outside this file and it is only used once inside this file (line 182)

## src/cli/menus/raw-picker.ts

- [dead] RawKeySessionCallbacks — 0 code references outside this file and only used internally
- [dead] RawKeySession — 0 code references outside this file and only used internally
- [dead] RawPickerOptions — 0 code references outside this file and only used internally

## src/cli/render/markdown-renderer.ts

- [dead] MarkdownStreamRenderer — interface exported at line 437, but the only external references are in its own documentation file; no runtime usage outside this file
- [dead] createMarkdownStreamRenderer — function exported at line 451, but the only external references are in its own documentation file; runtime usage outside this file is zero

## src/cli/render/transcript-record.ts

- [dead] TranscriptEntry — 0 code references outside this file; used only internally and in docs
- [dead] TranscriptRecord — 0 code references outside this file; used only internally and in docs

## src/cli/render/transcript-renderer.ts

- [dead] renderToolStep — 0 code references outside this file and it is only used once inside the file (line 394)

## src/cli/tools/tool-approval.ts

- [dead] `ToolApprovalChoice` type — exported but never referenced outside this file; the only references are internal and documentation.

## src/cli/tools/tool-invocation.ts

- [dead] ToolParam — 0 references outside the file and only used internally; the interface is never exported in a way that callers can name it.
- [dead] HighlightRange — 0 references outside the file and only used internally; the interface is never exported in a way that callers can name it.
- [dead] ParsedInvocation — 0 references outside the file and only used internally; the interface is never exported in a way that callers can name it.
- [dead] FieldSlot — 0 references outside the file and only used internally; the interface is never exported in a way that callers can name it.
- [dead] toolCallSlots — 0 references outside the file; the function is used only internally and never exported.

## src/commands/model.ts

- [dead] buildAllItemLines — re-exported on line 29 but never referenced outside this file and not used within the file

## src/eval/errors.ts

- [unexport] ApiError — nothing outside the file references the interface, but the file itself uses it. The code stays; the `export` keyword goes.

## src/eval/runner.ts

- [unexport] EvalToolCall — nothing outside the file references the symbol, but the file itself uses it. The code stays; the `export` keyword goes.
- [unexport] EvalTokenUsage — nothing outside the file references the symbol, but the file itself uses it. The code stays; the `export` keyword goes.

## src/providers/adapters/adapter-http-retry.ts

- [dead] FetchWithRetryOptions — 0 code references outside this file and it is only used once inside this file (line 164)

## src/providers/adapters/openai-compat.ts

- [dead] `quotaUpdateSink` — declared on line 15, assigned by `registerQuotaUpdateSink`, but the reference table shows zero hits for `quotaUpdateSink` outside this file and the file never reads it after assignment.
- [dead] `parallelToolsDisabled` — declared on line 35, mutated by `setParallelToolsDisabled`, but the reference table shows zero hits for `parallelToolsDisabled` outside this file and the file never reads it after mutation.

## src/providers/fake.ts

- [dead] FAKE_DEFAULT_MODEL_ID — exported but only used internally and documented; no external references
- [dead] FakeUsage — exported interface with no external references and only internal usage
- [dead] FakeModelCall — exported interface with no external references and only internal usage
- [dead] FakeModelResult — exported interface with no external references and only internal usage
- [dead] FakeToolCall — exported interface with no external references and only internal usage
- [dead] FakeNativeModelSettings — exported interface with no external references and only internal usage

## src/providers/model-data.ts

- [dead] ObservedRateLimits — 0 references outside the file and only used internally on line 48; the field is optional and the interface is never exported in a way that callers can reference it.
- [dead] CatalogModel — 0 references outside the file and only used internally on lines 224 and 244–245; the interface is never exported in a way that callers can reference it.

## src/providers/pricing-verifier.ts

- [dead] `VerifiedRates` — 0 external references and only used in exports and docs
- [dead] `LITELLM_PRICING_URL` — 0 external references and only used internally and in docs
- [dead] `OPENROUTER_MODELS_URL` — 0 external references and only used internally and in docs
- [dead] `getLiteLLMRates` — 0 external references and only used internally and in docs
- [dead] `getOpenRouterRates` — 0 external references and only used internally and in docs
- [dead] `getVerifiedRates` — 0 external references and only used internally and in docs

## src/providers/provider-registry.ts

- [dead] `ResolvedModel` — 2 references, both type-only imports in a script (`sweep.ts`) that never instantiates or accesses the interface's members.

## src/providers/quota/headers.ts

- [unexport] GroqRateLimitHeaders — interface is only used internally and in documentation
- [unexport] GroqRateLimitInfo — interface is only used internally and in documentation
- [unexport] RateLimitBucket — interface is only used internally and in documentation

## src/util/errors.ts

- [dead] `isNoSuchToolError` — 0 references outside the file and used only once inside `rejectedToolCall`
- [dead] `noSuchToolName` — 0 references outside the file and used only once inside `rejectedToolCall`
- [dead] `noSuchToolAvailableList` — 0 references outside the file and used only once inside `rejectedToolCall`
- [dead] `isInvalidToolArgumentsError` — 0 references outside the file and used only once inside `rejectedToolCall`
- [dead] `invalidToolName` — 0 references outside the file and used only once inside `rejectedToolCall`
- [dead] `invalidToolArgs` — function is never called anywhere

## HTTP diagnostics

- requests: 242 for 111 files (200×111 · 429×131)
- 429 responses: 131 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/131
- backoff waits: 218, 577.6s summed across workers (not wall time)
- successful call latency: median 1.6s · max 4.2s
- rate-limit headers on 429s: 131/131 carried them — req remaining 0 of limit 50, tokens remaining 0 of limit 50000
- 429 window: 21.1s → 247.8s into the run

### 429 timeline (seconds into run)

```
   21.1s  src/cli/eval/custom-eval-menu.ts
   21.8s  src/cli/eval/eval-dots.ts
   23.5s  src/cli/eval/eval-menu.ts
   23.5s  src/cli/eval/eval-screen.ts
   23.5s  src/cli/eval/custom-eval-menu.ts
   23.5s  src/cli/eval/eval-dots.ts
   25.7s  src/cli/eval/eval-screen.ts
   25.7s  src/cli/eval/custom-eval-menu.ts
   25.8s  src/cli/eval/eval-menu.ts
   25.7s  src/cli/eval/eval-dots.ts
   29.9s  src/cli/eval/eval-dots.ts
   29.9s  src/cli/eval/eval-menu.ts
   29.9s  src/cli/eval/eval-screen.ts
   29.9s  src/cli/eval/custom-eval-menu.ts
   38.2s  src/cli/eval/eval-menu.ts
   38.3s  src/cli/eval/eval-dots.ts
   38.2s  src/cli/eval/custom-eval-menu.ts
   38.3s  src/cli/eval/eval-screen.ts
   59.0s  src/cli/menus/model-screen.ts
   59.6s  src/cli/menus/raw-picker.ts
   60.1s  src/cli/render/banner.ts
   63.1s  src/cli/render/transcript-format.ts
   63.7s  src/cli/render/transcript-options.ts
   64.3s  src/cli/render/transcript-record.ts
   66.0s  src/cli/render/transcript-format.ts
   66.0s  src/cli/render/transcript-options.ts
   66.0s  src/cli/render/transcript-record.ts
   66.0s  src/cli/render/transcript-renderer.ts
   68.1s  src/cli/render/transcript-options.ts
   68.1s  src/cli/render/transcript-record.ts
   68.1s  src/cli/render/transcript-format.ts
   68.1s  src/cli/render/transcript-renderer.ts
   72.3s  src/cli/render/transcript-options.ts
   72.3s  src/cli/render/transcript-format.ts
   72.3s  src/cli/render/transcript-record.ts
   72.3s  src/cli/render/transcript-renderer.ts
   82.2s  src/cli/render/transcript-replay.ts
   82.9s  src/cli/scripted-mode.ts
   83.5s  src/cli/session-modes.ts
   84.2s  src/cli/session-runner.ts
   85.4s  src/cli/render/transcript-replay.ts
   85.4s  src/cli/session-runner.ts
   85.4s  src/cli/session-modes.ts
   85.4s  src/cli/scripted-mode.ts
   87.5s  src/cli/session-runner.ts
   87.6s  src/cli/session-modes.ts
   87.6s  src/cli/scripted-mode.ts
   87.6s  src/cli/render/transcript-replay.ts
   91.7s  src/cli/session-runner.ts
   91.7s  src/cli/scripted-mode.ts
   91.7s  src/cli/session-modes.ts
   91.8s  src/cli/render/transcript-replay.ts
  107.2s  src/commands/config.ts
  108.0s  src/commands/model.ts
  109.0s  src/commands/renderer.ts
  109.9s  src/commands/status.ts
  113.1s  src/config/index.ts
  114.2s  src/eval/custom.ts
  115.2s  src/eval/errors.ts
  117.1s  src/eval/custom.ts
  117.1s  src/eval/history.ts
  117.1s  src/config/index.ts
  117.0s  src/eval/errors.ts
  119.5s  src/eval/errors.ts
  119.5s  src/eval/custom.ts
  119.5s  src/config/index.ts
  119.5s  src/eval/history.ts
  123.7s  src/eval/custom.ts
  123.7s  src/eval/errors.ts
  123.7s  src/config/index.ts
  123.7s  src/eval/history.ts
  134.9s  src/eval/humaneval-data.ts
  136.0s  src/eval/result-sink.ts
  137.0s  src/eval/runner.ts
  138.1s  src/index.ts
  140.9s  src/logger.ts
  142.0s  src/providers/adapters/adapter-http-retry.ts
  143.1s  src/providers/adapters/adapter-usage-capture.ts
  144.1s  src/providers/adapters/openai-compat-quirks.ts
  145.2s  src/providers/adapters/adapter-usage-capture.ts
  145.2s  src/providers/adapters/adapter-http-retry.ts
  145.2s  src/logger.ts
  145.2s  src/providers/adapters/openai-compat-quirks.ts
  147.4s  src/logger.ts
  147.3s  src/providers/adapters/adapter-usage-capture.ts
  147.4s  src/providers/adapters/openai-compat-quirks.ts
  147.4s  src/providers/adapters/adapter-http-retry.ts
  151.5s  src/providers/adapters/openai-compat-quirks.ts
  151.5s  src/providers/adapters/adapter-usage-capture.ts
  151.6s  src/logger.ts
  151.6s  src/providers/adapters/adapter-http-retry.ts
  167.3s  src/providers/model-data.ts
  168.2s  src/providers/model-quirks.ts
  169.3s  src/providers/model-settings-accessor.ts
  170.1s  src/providers/openai-daily-spend.ts
  171.3s  src/providers/openai-daily-spend.ts
  171.3s  src/providers/model-settings-accessor.ts
  171.3s  src/providers/model-quirks.ts
  171.3s  src/providers/model-data.ts
  173.4s  src/providers/model-settings-accessor.ts
  173.4s  src/providers/openai-daily-spend.ts
  173.4s  src/providers/model-quirks.ts
  177.6s  src/providers/paid-guard.ts
  177.5s  src/providers/model-settings-accessor.ts
  177.5s  src/providers/model-quirks.ts
  177.5s  src/providers/openai-daily-spend.ts
  189.9s  src/providers/provider-registry.ts
  190.6s  src/providers/quota/cache.ts
  192.2s  src/providers/types.ts
  194.8s  src/providers/user-blocklist.ts
  195.6s  src/store/call-log.ts
  197.1s  src/store/db-config-cache.ts
  197.1s  src/providers/user-blocklist.ts
  197.1s  src/store/db-load.ts
  199.3s  src/store/call-log.ts
  199.3s  src/store/db-load.ts
  199.3s  src/providers/user-blocklist.ts
  199.3s  src/store/db-config-cache.ts
  203.4s  src/providers/user-blocklist.ts
  203.4s  src/store/call-log.ts
  203.4s  src/store/db-config-cache.ts
  203.4s  src/store/db-load.ts
  211.6s  src/providers/user-blocklist.ts
  211.6s  src/store/db-config-cache.ts
  211.6s  src/store/call-log.ts
  211.6s  src/store/db-load.ts
  241.0s  src/util/line-diff.ts
  241.6s  src/util/line-numbers.ts
  242.9s  src/util/text-encoding.ts
  245.4s  src/util/wrap-rows.ts
  247.8s  src/util/wrap-rows.ts
```

Requests per file: min 1 · median 1 · max 6.
A file that never hits a limit sends 1; anything above that is retry traffic.

