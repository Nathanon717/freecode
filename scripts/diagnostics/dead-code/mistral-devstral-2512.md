# Dead code — mistral:devstral-2512

111 files · 84 ok · 27 dead · 15 recovered · 3m03s

## src/agent/parsed-tools.ts

- [unexport] `ParsedToolsResult` — The interface is only used internally in this file and has no external references outside of documentation.

## src/agent/stream-turn.ts _(verdict recovered from a malformed answer)_

- [unexport] RecoveringStreamOptions — no code references outside this file; only used internally and documented.
- [unexport] RecoveringStreamOutcome — no code references outside this file; only used internally and documented.

## src/agent/subagents/run-subagent.ts _(verdict recovered from a malformed answer)_

- [unexport] SubAgentContext — type is only used internally and has no external references outside documentation.

## src/agent/workspace.ts

- [unexport] `ResolvedProjectPath` — the interface is only used as a return type within this file and has no external code references; it is documented but not used by other code.

## src/cli/chrome/toggles.ts

- [unexport] `AskMode` — type is only referenced in JSDoc and documentation, not used by any other code.

## src/cli/command-dispatcher.ts _(verdict recovered from a malformed answer)_

- [unexport] CommandDispatchResult — type is only used internally and has no external references outside documentation.

## src/cli/headless-prompt.ts _(verdict recovered from a malformed answer)_

- [unexport] HeadlessPromptOptions — interface is only used internally and has no external code references.

## src/cli/menus/action-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] ActionMenuResult — type is only used internally and has no external references.

## src/cli/menus/list-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] ListMenuOptions — no external references, only used internally.

## src/cli/menus/menu-shell.ts _(verdict recovered from a malformed answer)_

- [unexport] MenuShellOptions — interface is only used locally and has no external references.

## src/cli/menus/raw-picker.ts

- [unexport] `RawKeySessionCallbacks` — only used internally by `runRawKeySession` and documented but not imported elsewhere.
- [unexport] `RawKeySession` — only used internally by `runRawKeySession` and documented but not imported elsewhere.
- [unexport] `RawPickerOptions` — only used internally by `runRawPicker` and documented but not imported elsewhere.

## src/cli/render/markdown-renderer.ts _(verdict recovered from a malformed answer)_

- [unexport] MarkdownStreamRenderer — The interface is only used internally and has no external references.

## src/cli/render/transcript-record.ts _(verdict recovered from a malformed answer)_

- [unexport] TranscriptEntry — type is only used internally and has no external references.
- [unexport] TranscriptRecord — interface is only used internally and has no external references.

## src/cli/render/transcript-renderer.ts

- [unexport] `formatParsedToolCallLine` — Re-exported but only referenced in its original file (`transcript-format.ts`), not used elsewhere.
- [unexport] `formatRationaleLine` — Re-exported but only referenced in its original file (`transcript-format.ts`), not used elsewhere.
- [unexport] `formatToolErrorLine` — Re-exported but only referenced in its original file (`transcript-format.ts`) and tests, not used elsewhere in code.
- [unexport] `formatTranscriptStepDivider` — Re-exported but only referenced in its original file (`transcript-format.ts`) and tests, not used elsewhere in code.
- [unexport] `ToolStep` — Exported but only used internally in this file and in `transcript-record.ts` (which imports it directly), not referenced elsewhere.
- [unexport] `ToolCallHeaderRows` — Exported but only used internally in this file, not referenced elsewhere.
- [unexport] `RenderedStep` — Exported but only used internally in this file, not referenced elsewhere.
- [unexport] `renderToolStep` — Exported but only used internally in this file, not referenced elsewhere in code (only in docs).

## src/cli/tools/tool-approval.ts _(verdict recovered from a malformed answer)_

- [unexport] ToolApprovalChoice — type is only used internally and has no external references outside documentation.

## src/cli/tools/tool-invocation.ts

- [unexport] `ToolParam` — 0 code references outside this file, only used internally.
- [unexport] `HighlightRange` — 0 code references outside this file, only used internally.
- [unexport] `ParsedInvocation` — 0 code references outside this file, only used internally.
- [unexport] `FieldSlot` — 0 code references outside this file, only used internally.
- [unexport] `toolCallSlots` — 0 code references outside this file, only used internally.

## src/eval/errors.ts _(verdict recovered from a malformed answer)_

- [unexport] ApiError — interface is only used internally by extractApiErrors and has no external references.

## src/eval/runner.ts

- [unexport] `EvalToolCall` — interface is only used internally and has no external references.
- [unexport] `EvalTokenUsage` — interface is only used internally and has no external references.

## src/providers/adapters/adapter-http-retry.ts

- [unexport] `FetchWithRetryOptions` — The interface is only used internally (line 164) and has no external references outside documentation.

## src/providers/adapters/openai-compat-quirks.ts _(verdict recovered from a malformed answer)_

- [unexport] OpenAICompatQuirks — interface is only used within this file and has no external references outside of documentation.

## src/providers/fake.ts

- [unexport] `FAKE_DEFAULT_MODEL_ID` — only used internally (line 112) and mentioned in docs, but no external code references it.
- [unexport] `FakeUsage` — only used internally (lines 33, 72, 90) and mentioned in docs, but no external code references it.
- [unexport] `FakeModelCall` — only used internally (lines 194, 295, 378) and mentioned in docs, but no external code references it.
- [unexport] `FakeModelResult` — only used internally (line 378) and mentioned in docs, but no external code references it.
- [unexport] `FakeToolCall` — only used internally (lines 35, 73, 89, 128) and mentioned in docs, but no external code references it.
- [unexport] `FakeNativeModelSettings` — only used internally (line 272) and mentioned in docs, but no external code references it.

## src/providers/model-data.ts

- [unexport] `ObservedRateLimits` — interface is only used internally (line 48) and has no external references.
- [unexport] `CatalogModel` — interface is only used internally (lines 224, 244, 245) and has no external references.

## src/providers/pricing-verifier.ts _(verdict recovered from a malformed answer)_

- [unexport] VerifiedRates — 0 code references outside this file, only used internally and in documentation
- [unexport] LITELLM_PRICING_URL — 0 code references outside this file, only used internally and in documentation
- [unexport] OPENROUTER_MODELS_URL — 0 code references outside this file, only used internally and in documentation
- [unexport] getLiteLLMRates — 0 code references outside this file, only used internally and in documentation
- [unexport] getOpenRouterRates — 0 code references outside this file, only used internally and in documentation
- [unexport] getVerifiedRates — 0 code references outside this file, only used internally and in documentation

## src/providers/quota/headers.ts

- [unexport] `GroqRateLimitHeaders` — interface is only used internally and in documentation, not referenced elsewhere in code.
- [unexport] `GroqRateLimitInfo` — interface is only used internally and in documentation, not referenced elsewhere in code.
- [unexport] `RateLimitBucket` — interface is only used internally and in documentation, not referenced elsewhere in code.

## src/providers/types.ts _(verdict recovered from a malformed answer)_

- [unexport] RateLimits — interface is only used internally (line 13) and has no external code references; docs mentions are not uses.

## src/store/model-list-cache.ts

- [unexport] `RawCachedModel` — interface is only used internally and has no external references.
- [unexport] `CacheUpdateResult` — interface is only used internally and has no external references.

## src/util/errors.ts _(verdict recovered from a malformed answer)_

- [unexport] isNoSuchToolError — only used internally and has no external references.
- [unexport] noSuchToolName — only used internally and has no external references.
- [unexport] noSuchToolAvailableList — only used internally and has no external references.
- [unexport] isInvalidToolArgumentsError — only used internally and has no external references.
- [unexport] invalidToolName — only used internally and has no external references.

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.0s · max 61.2s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

