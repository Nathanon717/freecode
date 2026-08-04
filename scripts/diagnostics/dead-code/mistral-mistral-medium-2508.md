# Dead code — mistral:mistral-medium-2508

111 files · 81 ok · 27 dead · 3 error · 20 recovered · 3m48s

## src/agent/parsed-tools.ts _(verdict recovered from a malformed answer)_

- [unexport] ParsedToolsResult — interface has 0 code references outside this file and is only used internally

## src/agent/stream-turn.ts

- [unexport] `RecoveringStreamOptions` — only used locally (line 65) and in documentation, no external code references
- [unexport] `RecoveringStreamOutcome` — only used locally (line 66) and in documentation, no external code references

## src/agent/subagents/run-subagent.ts _(verdict recovered from a malformed answer)_

- [unexport] `SubAgentContext` — type is only used internally (lines 49, 116) and has no code references outside this file; documentation mentions are not uses.

## src/agent/workspace.ts

- [unexport] `ResolvedProjectPath` — the interface is only used internally by this file's functions, and all external references are documentation-only. The type is already visible to callers via the functions' return types.

## src/cli/chrome/toggles.ts _(verdict recovered from a malformed answer)_

- [unexport] AskMode — type has 0 code references outside this file; only documentation mentions remain

## src/cli/command-dispatcher.ts _(verdict recovered from a malformed answer)_

- [unexport] `CommandDispatchResult` — type is only used internally (line 161), never referenced outside this file

## src/cli/headless-prompt.ts _(verdict recovered from a malformed answer)_

- [unexport] `HeadlessPromptOptions` — interface is only used locally (line 77) and has no code references outside this file.

## src/cli/menus/action-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] `ActionMenuResult` — type is only used internally (line 34) and has no external code references; documentation mentions do not count as usage.

## src/cli/menus/list-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] ListMenuOptions — no code references outside this file; only used internally and documented

## src/cli/menus/menu-shell.ts _(verdict recovered from a malformed answer)_

- [unexport] MenuShellOptions — only referenced within this file and documented, not used elsewhere in code

## src/cli/menus/raw-picker.ts _(verdict recovered from a malformed answer)_

- [unexport] RawKeySessionCallbacks — no external references; only used internally by `runRawKeySession`.
- [unexport] RawKeySession — no external references; only used internally by `runRawKeySession`.
- [unexport] RawPickerOptions — no external references; only used internally by `runRawPicker`.

## src/cli/render/markdown-renderer.ts

- [unexport] `MarkdownStreamRenderer` — no code outside this file references the interface; it is only used internally by `createMarkdownStreamRenderer` and mentioned in documentation.

## src/cli/render/transcript-record.ts _(verdict recovered from a malformed answer)_

- [unexport] TranscriptEntry — no code references outside this file; only used internally and documented
- [unexport] TranscriptRecord — no code references outside this file; only used internally and documented

## src/cli/render/transcript-renderer.ts

- [unexport] `formatParsedToolCallLine` — only referenced in its own source file (`transcript-format.ts`) and documentation, with no external code usage.
- [unexport] `formatRationaleLine` — only referenced in its own source file (`transcript-format.ts`) and tests, with no external code usage beyond this re-export.
- [unexport] `formatTranscriptStepDivider` — only referenced in its own source file (`transcript-format.ts`) and tests, with no external code usage beyond this re-export.
- [unexport] `formatToolErrorLine` — only referenced in its own source file (`transcript-format.ts`) and tests, with no external code usage beyond this re-export.
- [unexport] `ToolStep` — only used internally by this file and `transcript-record.ts` (which imports it directly), with no external code usage beyond this re-export.
- [unexport] `ToolCallHeaderRows` — only used internally by this file, with no external code usage.

## src/cli/scripted-mode.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/cli/session-modes.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/cli/tools/tool-approval.ts

- [unexport] `ToolApprovalChoice` — type is only used internally (lines 109, 192, 270, 277) and has no external code references (only documentation mentions).

## src/cli/tools/tool-invocation.ts _(verdict recovered from a malformed answer)_

- [unexport] ToolParam — no external references; only used internally for `TOOL_PARAMS`.
- [unexport] HighlightRange — no external references; only used internally by `toolNameHighlightRanges` and `styleToolNames`.
- [unexport] ParsedInvocation — no external references; only used internally as the return type of `parseToolInvocation`.
- [unexport] FieldSlot — no external references; only used internally by `toolCallSlots`, `nextToolFieldCaret`, and `toolFieldBackspace`.

## src/eval/errors.ts

- [unexport] `ApiError` — interface is only used internally by `extractApiErrors` and has no external code references (only documentation mentions).

## src/eval/runner.ts _(verdict recovered from a malformed answer)_

- [unexport] EvalToolCall — no code outside this file references the interface; it is only used internally.
- [unexport] EvalTokenUsage — no code outside this file references the interface; it is only used internally.

## src/providers/adapters/adapter-http-retry.ts

- [unexport] `FetchWithRetryOptions` — interface is only used internally (line 164) and has no external code references; documentation mentions are not uses.

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] `OpenAICompatQuirks` — interface has 0 code references outside this file, only used internally and mentioned in docs.

## src/providers/adapters/openai-compat-sse.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/providers/fake.ts _(verdict recovered from a malformed answer)_

- [unexport] FAKE_DEFAULT_MODEL_ID — only used internally (line 112) and documented, with no external code references
- [unexport] FakeUsage — only used internally (lines 33, 72, 90) and documented, with no external code references
- [unexport] FakeModelCall — only used internally (lines 194, 295, 378) and documented, with no external code references
- [unexport] FakeModelResult — only used internally (line 378) and documented, with no external code references
- [unexport] FakeToolCall — only used internally (lines 35, 73, 89, 128) and documented, with no external code references
- [unexport] FakeNativeModelSettings — only used internally (line 272) and documented, with no external code references

## src/providers/model-data.ts _(verdict recovered from a malformed answer)_

- [unexport] `ObservedRateLimits` — interface has 0 code references outside this file (only docs and internal use)
- [unexport] `CatalogModel` — interface has 0 code references outside this file (only docs and internal use)

## src/providers/pricing-verifier.ts _(verdict recovered from a malformed answer)_

- [unexport] VerifiedRates — no code references outside this file; only used internally and documented
- [unexport] LITELLM_PRICING_URL — no code references outside this file; only used internally and documented
- [unexport] OPENROUTER_MODELS_URL — no code references outside this file; only used internally and documented
- [unexport] getLiteLLMRates — no code references outside this file; only used internally and documented
- [unexport] getOpenRouterRates — no code references outside this file; only used internally and documented
- [unexport] getVerifiedRates — no code references outside this file; only used internally and documented

## src/providers/quota/headers.ts _(verdict recovered from a malformed answer)_

- [unexport] GroqRateLimitHeaders — only used internally and in documentation
- [unexport] GroqRateLimitInfo — only used internally and in documentation
- [unexport] RateLimitBucket — only used internally and in documentation

## src/providers/types.ts _(verdict recovered from a malformed answer)_

- [unexport] `RateLimits` — no code outside this file references the interface; only documentation mentions it.

## src/store/model-list-cache.ts _(verdict recovered from a malformed answer)_

- [unexport] RawCachedModel — interface has no external references; only used internally
- [unexport] CacheUpdateResult — interface has no external references; only used internally

## src/util/errors.ts _(verdict recovered from a malformed answer)_

- [unexport] `isNoSuchToolError` — only used internally (line 226) and has no external references beyond documentation.
- [unexport] `noSuchToolName` — only used internally (line 227) and has no external references beyond documentation.
- [unexport] `noSuchToolAvailableList` — only used internally (line 228) and has no external references beyond documentation.
- [unexport] `isInvalidToolArgumentsError` — only used internally (line 238) and has no external references beyond documentation.
- [unexport] `invalidToolName` — only used internally (line 239) and has no external references beyond documentation.

## HTTP diagnostics

- requests: 186 for 111 files (200×108 · 429×78)
- 429 responses: 78 total, of which 3 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/78
- backoff waits: 123, 552.1s summed across workers (not wall time)
- successful call latency: median 1.4s · max 4.4s
- rate-limit headers on 429s: 78/78 carried them — req remaining 0 of limit 23, tokens remaining absent of limit absent
- 429 window: 18.0s → 198.7s into the run

### 429 timeline (seconds into run)

```
   18.0s  src/cli/chrome/bottom-ui.ts
   18.6s  src/cli/chrome/footer-status.ts
   19.8s  src/cli/chrome/toggles.ts
   19.8s  src/cli/chrome/input-buffer.ts
   19.8s  src/cli/chrome/bottom-ui.ts
   22.1s  src/cli/chrome/toggles.ts
   22.0s  src/cli/chrome/footer-status.ts
   22.1s  src/cli/chrome/bottom-ui.ts
   22.1s  src/cli/chrome/input-buffer.ts
   26.3s  src/cli/chrome/bottom-ui.ts
   26.3s  src/cli/chrome/footer-status.ts
   26.3s  src/cli/chrome/input-buffer.ts
   26.3s  src/cli/chrome/toggles.ts
   49.0s  src/cli/scripted-mode.ts
   49.5s  src/cli/session-modes.ts
   51.1s  src/cli/slash-commands.ts
   51.1s  src/cli/scripted-mode.ts
   51.1s  src/cli/session-runner.ts
   51.1s  src/cli/session-modes.ts
   53.4s  src/cli/session-runner.ts
   53.4s  src/cli/scripted-mode.ts
   53.4s  src/cli/slash-commands.ts
   53.4s  src/cli/session-modes.ts
   57.5s  src/cli/scripted-mode.ts
   57.5s  src/cli/slash-commands.ts
   57.5s  src/cli/session-modes.ts
   57.5s  src/cli/session-runner.ts
   65.9s  src/cli/session-runner.ts
   65.9s  src/cli/slash-commands.ts
   65.9s  src/cli/session-modes.ts
   65.9s  src/cli/scripted-mode.ts
   82.3s  src/cli/session-modes.ts
   82.3s  src/cli/slash-commands.ts
   82.3s  src/cli/session-runner.ts
   82.3s  src/cli/scripted-mode.ts
   84.1s  src/cli/stdout-retry-sink.ts
  114.8s  src/providers/adapters/openai-compat-sse.ts
  115.5s  src/providers/adapters/openai-compat.ts
  117.0s  src/providers/adapters/openai-compat-sse.ts
  117.0s  src/providers/index.ts
  117.0s  src/providers/fake.ts
  119.1s  src/providers/index.ts
  119.1s  src/providers/adapters/openai-compat-sse.ts
  119.1s  src/providers/adapters/openai-compat.ts
  119.2s  src/providers/fake.ts
  123.3s  src/providers/index.ts
  123.3s  src/providers/adapters/openai-compat-sse.ts
  123.3s  src/providers/adapters/openai-compat.ts
  123.3s  src/providers/fake.ts
  131.5s  src/providers/index.ts
  131.5s  src/providers/adapters/openai-compat-sse.ts
  131.5s  src/providers/fake.ts
  131.5s  src/providers/adapters/openai-compat.ts
  147.8s  src/providers/adapters/openai-compat-sse.ts
  147.8s  src/providers/index.ts
  147.8s  src/providers/fake.ts
  147.8s  src/providers/adapters/openai-compat.ts
  149.8s  src/providers/model-data.ts
  181.1s  src/tokenizers/backends/bpe-json.ts
  181.8s  src/tokenizers/backends/tekken.ts
  182.3s  src/tokenizers/backends/tiktoken.ts
  182.9s  src/tokenizers/chat-format.ts
  184.0s  src/tokenizers/backends/tiktoken.ts
  184.0s  src/tokenizers/backends/tekken.ts
  184.0s  src/tokenizers/chat-format.ts
  184.0s  src/tokenizers/backends/bpe-json.ts
  186.2s  src/tokenizers/backends/bpe-json.ts
  186.2s  src/tokenizers/backends/tekken.ts
  186.2s  src/tokenizers/chat-format.ts
  186.2s  src/tokenizers/backends/tiktoken.ts
  190.4s  src/tokenizers/chat-format.ts
  190.4s  src/tokenizers/backends/tekken.ts
  190.4s  src/tokenizers/backends/bpe-json.ts
  190.4s  src/tokenizers/backends/tiktoken.ts
  198.7s  src/tokenizers/backends/bpe-json.ts
  198.7s  src/tokenizers/backends/tekken.ts
  198.7s  src/tokenizers/backends/tiktoken.ts
  198.7s  src/tokenizers/chat-format.ts
```

### Terminal failures

```
   49.0s start    35.8s spent   6 requests  src/cli/scripted-mode.ts
   49.5s start    34.6s spent   6 requests  src/cli/session-modes.ts
  114.8s start    35.0s spent   6 requests  src/providers/adapters/openai-compat-sse.ts
```

Requests per file: min 1 · median 1 · max 6.
A file that never hits a limit sends 1; anything above that is retry traffic.

