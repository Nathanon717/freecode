# Dead code — mistral:mistral-medium-2505

111 files · 69 ok · 36 dead · 6 error · 3m34s

## src/agent/parsed-tools.ts

- [unexport] `ParsedToolsResult` — This interface is not referenced outside the file, but is used internally. The `export` keyword can be removed.

## src/agent/stream-turn.ts

- [unexport] `RecoveringStreamOptions` — This interface is only used within the file and has no external references.
- [unexport] `RecoveringStreamOutcome` — This interface is only used within the file and has no external references.

## src/agent/subagents/run-subagent.ts

- [unexport] `SubAgentContext` — This type is only used within the file and has no external references.

## src/agent/tools/index.ts

- [unexport] `ToolTraceEvent` — This interface is only used locally within the file and is not referenced outside of it.
- [unexport] `PreviewState` — This interface is only used locally within the file and is not referenced outside of it.

## src/agent/workspace.ts

- [unexport] `ResolvedProjectPath` — This interface is only used within the file and has no external references outside of documentation.

## src/cli/chrome/bottom-ui.ts

- [dead] `_overlayEpochStarted` — This variable is set but never read. The evidence shows that it is only used in a write operation and there are no references to it outside this file.
- [dead] `_resizeDebounce` — This variable is set but never read outside of its own assignment and the clearTimeout call. There are no references to it outside this file.
- [dead] `_onResizeCallback` — This variable is set but only used within the file itself. There are references to it in the code, but they are all within the file and there are no external references that indicate it is used elsewhere.

## src/cli/chrome/toggles.ts

- [unexport] `AskMode` — type is only used internally and in documentation, with no external code references.

## src/cli/command-dispatcher.ts

- [unexport] `CommandDispatchResult` — This type is only used within the file and not referenced elsewhere in the codebase.
- [unexport] `ModelListMode` — This type is only used in `src/cli/session-runner.ts` and can be moved there instead of being exported from this file.

## src/cli/headless-prompt.ts

- [unexport] `HeadlessPromptOptions` — interface is only used internally, with no external references outside of documentation.

## src/cli/menus/action-menu.ts

- [unexport] `ActionMenuResult` — Type is only used internally, with no references outside this file.

## src/cli/menus/list-menu.ts

- [unexport] `ListMenuOptions` — This interface is only used locally within the file and has no external references in the codebase, only in documentation.

## src/cli/menus/menu-shell.ts

- [unexport] `MenuShellOptions` — interface is only used locally in the file, but is exported.

## src/cli/menus/raw-picker.ts

- [unexport] `RawKeySessionCallbacks` — interface is only used internally.
- [unexport] `RawKeySession` — interface is only used internally.
- [unexport] `RawPickerOptions` — interface is only used internally.

## src/cli/render/markdown-renderer.ts

- [unexport] `MarkdownStreamRenderer` — This interface is only used locally within the file and has no external references.

## src/cli/render/transcript-format.ts

- [unexport] `TOOL_DISPLAY_NAMES` — This constant is defined but never used within the file or referenced outside of it.
- [unexport] `TOOL_ARG_FILTERS` — This constant is used within the file but not referenced outside of it.
- [unexport] `displayName` — This function is used within the file but not referenced outside of it.
- [unexport] `splitDiffLines` — This function is used within the file but not referenced outside of it.

## src/cli/render/transcript-record.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/cli/render/transcript-renderer.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/cli/render/transcript-replay.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/cli/slash-commands.ts

- [unexport] `SlashCommandInfo` — The interface is only used internally in this file and in `src/commands/renderer.ts` which redefines it. The export is unnecessary.
- [dead] `fuzzyMatch` — This function is only used by `getRawFilteredCommands`, which is itself only used within this file. The function is not exported and has no other references.
- [dead] `getRawFilteredCommands` — This function is only used by `getCommandCompletion` and `getFilteredCommands` within this file. It is not exported and has no other references.

## src/cli/tools/tool-approval.ts

- [unexport] `ToolApprovalChoice` — type is only used locally, but is exported.

## src/cli/tools/tool-invocation.ts

- [unexport] `ToolParam` — This interface is only used internally and not referenced outside the file.
- [unexport] `HighlightRange` — This interface is only used internally and not referenced outside the file.
- [unexport] `ParsedInvocation` — This interface is only used internally and not referenced outside the file.
- [unexport] `FieldSlot` — This interface is only used internally and not referenced outside the file.
- [unexport] `toolCallSlots` — This function is only used internally and not referenced outside the file.

## src/config/index.ts

- [unexport] `getConfigPaths` — This function is only used internally within the file and has no external references that would require it to be exported.
- [unexport] `readRawConfig` — This function is only used internally within the file and has no external references that would require it to be exported.
- [unexport] `updateGlobalConfig` — This function is only used internally within the file and has no external references that would require it to be exported.

## src/eval/errors.ts

- [unexport] `ApiError` — interface is only used internally, not referenced outside this file.

## src/eval/humaneval-data.ts

- [unexport] `HumanEvalResultMap` — This type is only used internally within the file and has no external references that would require it to be exported.

## src/eval/runner.ts

- [unexport] `EvalToolCall` — This interface is only used internally within the file and has no external references.
- [unexport] `EvalTokenUsage` — This interface is only used internally within the file and has no external references.

## src/providers/adapters/adapter-http-retry.ts

- [unexport] `FetchWithRetryOptions` — This interface is only used internally within the file and has no external references outside of documentation mentions.

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] `OpenAICompatQuirks` — interface is only used within this file and has no code references outside of it.

## src/providers/adapters/openai-compat.ts

- [stale] `// Transport failure — no response, so no status and no provider usage.` — The comment is outdated as the code block it refers to includes `recordLlmCall` which does record the error.
- [stale] `// Most-recently captured rate-limit headers per provider ID. Written by the // custom fetch wrapper; read by the agent loop for logging.` — The comment is outdated as the code does not show any agent loop for logging.

## src/providers/fake.ts

- [unexport] `FAKE_DEFAULT_MODEL_ID` — only used internally, not referenced outside the file
- [unexport] `FakeUsage` — only used internally, not referenced outside the file
- [unexport] `FakeModelCall` — only used internally, not referenced outside the file
- [unexport] `FakeModelResult` — only used internally, not referenced outside the file
- [unexport] `FakeToolCall` — only used internally, not referenced outside the file
- [unexport] `FakeNativeModelSettings` — only used internally, not referenced outside the file

## src/providers/model-data.ts

- [unexport] `ObservedRateLimits` — interface is only used locally and has no external references.
- [unexport] `CatalogModel` — interface is only used locally and has no external references.

## src/providers/pricing-verifier.ts

- [unexport] `VerifiedRates` — interface is used only within this file and has no external references except documentation.
- [unexport] `LITELLM_PRICING_URL` — constant is used only within this file and has no external references except documentation.
- [unexport] `OPENROUTER_MODELS_URL` — constant is used only within this file and has no external references except documentation.
- [unexport] `getLiteLLMRates` — function is used only within this file and has no external references except documentation.
- [unexport] `getOpenRouterRates` — function is used only within this file and has no external references except documentation.
- [unexport] `getVerifiedRates` — function is used only within this file and has no external references except documentation.

## src/providers/provider-catalog.ts

- [unexport] `isZenFreeModelId` — This function is only used locally within the file and is not referenced elsewhere.
- [unexport] `ZEN_FREE_IDS` — This constant is only used locally within the file and is not referenced elsewhere.
- [unexport] `ZEN_RETIRED_FREE_IDS` — This constant is only used locally within the file and is not referenced elsewhere.

## src/providers/quota/headers.ts

- [unexport] `GroqRateLimitHeaders` — This interface is only used within the file and not referenced elsewhere in the codebase.
- [unexport] `GroqRateLimitInfo` — This interface is only used within the file and not referenced elsewhere in the codebase.
- [unexport] `RateLimitBucket` — This interface is only used within the file and not referenced elsewhere in the codebase.

## src/providers/types.ts

- [unexport] `RateLimits` — interface is only used within this file, not referenced elsewhere in the codebase.

## src/store/db.ts

- [unexport] `isSyncReplica` — This function is not referenced outside of the file.
- [unexport] `enqueueWrite` — This function is not referenced outside of the file.
- [unexport] `persistDbConfigRowAsync` — This function is not referenced outside of the file.

## src/store/model-list-cache.ts

- [unexport] `RawCachedModel` — interface is only used internally
- [unexport] `CacheUpdateResult` — interface is only used internally

## src/tokenizers/backends/tekken.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/tokenizers/backends/tiktoken.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/tokenizers/chat-format.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/tokenizers/model-family.ts

- [unexport] `LLAMA3_FAMILY` — Only used in tests, not in other code.
- [unexport] `DEEPSEEK_V3_FAMILY` — Only used in tests, not in other code.
- [unexport] `DEEPSEEK_V4_FAMILY` — Only used in tests, not in other code.
- [unexport] `GLM4_FAMILY` — Only used in tests, not in other code.

## src/util/errors.ts

- [unexport] `ApiErrorDetails` — interface is not referenced outside the file
- [unexport] `invalidToolName` — function is not referenced outside the file
- [unexport] `invalidToolArgs` — function is not referenced outside the file
- [unexport] `noSuchToolName` — function is not referenced outside the file
- [unexport] `noSuchToolAvailableList` — function is not referenced outside the file
- [unexport] `isNoSuchToolError` — function is not referenced outside the file
- [unexport] `isInvalidToolArgumentsError` — function is not referenced outside the file

## src/util/screen-buffer.ts

- [unexport] `wrapStyledToRows` — This function is used internally by `getScreenBufferScrollRegionLines` but is not referenced elsewhere in the repository.
- [dead] `MAX_LINES` — This constant is only used within the file and does not affect any exported functionality.
- [dead] `displayLineBufferStyled` — This array is only used within the file and does not affect any exported functionality.
- [dead] `installed` — This variable is only used within the file and does not affect any exported functionality.
- [dead] `epochStart` — This variable is only used within the file and does not affect any exported functionality.
- [dead] `capturing` — This variable is only used within the file and does not affect any exported functionality.
- [dead] `hasCursorOrScreenControl` — This function is only used within the file and does not affect any exported functionality.
- [dead] `hasFullScreenErase` — This function is only used within the file and does not affect any exported functionality.
- [dead] `pushDisplayLines` — This function is only used within the file and does not affect any exported functionality.

## HTTP diagnostics

- requests: 168 for 111 files (200×105 · 429×63)
- 429 responses: 63 total, of which 6 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/63
- backoff waits: 94, 482.5s summed across workers (not wall time)
- successful call latency: median 1.5s · max 5.9s
- rate-limit headers on 429s: 63/63 carried them — req remaining 0 of limit 25, tokens remaining absent of limit absent
- 429 window: 34.2s → 186.8s into the run

### 429 timeline (seconds into run)

```
   34.2s  src/cli/render/transcript-record.ts
   35.1s  src/cli/render/transcript-renderer.ts
   35.9s  src/cli/render/transcript-replay.ts
   37.5s  src/cli/scripted-mode.ts
   37.5s  src/cli/render/transcript-record.ts
   37.5s  src/cli/render/transcript-replay.ts
   37.5s  src/cli/render/transcript-renderer.ts
   39.7s  src/cli/render/transcript-replay.ts
   39.7s  src/cli/render/transcript-record.ts
   39.7s  src/cli/render/transcript-renderer.ts
   39.7s  src/cli/scripted-mode.ts
   43.9s  src/cli/render/transcript-replay.ts
   43.9s  src/cli/scripted-mode.ts
   43.9s  src/cli/render/transcript-renderer.ts
   43.9s  src/cli/render/transcript-record.ts
   52.4s  src/cli/render/transcript-replay.ts
   52.4s  src/cli/scripted-mode.ts
   52.4s  src/cli/render/transcript-record.ts
   52.4s  src/cli/render/transcript-renderer.ts
   68.8s  src/cli/scripted-mode.ts
   68.8s  src/cli/render/transcript-record.ts
   68.8s  src/cli/render/transcript-renderer.ts
   68.8s  src/cli/render/transcript-replay.ts
  101.7s  src/providers/adapters/openai-compat-sse.ts
  102.3s  src/providers/adapters/openai-compat.ts
  103.6s  src/providers/index.ts
  103.6s  src/providers/adapters/openai-compat-sse.ts
  103.6s  src/providers/fake.ts
  105.7s  src/providers/adapters/openai-compat-sse.ts
  105.7s  src/providers/adapters/openai-compat.ts
  105.7s  src/providers/fake.ts
  105.7s  src/providers/index.ts
  109.9s  src/providers/adapters/openai-compat-sse.ts
  109.9s  src/providers/fake.ts
  109.9s  src/providers/index.ts
  109.9s  src/providers/adapters/openai-compat.ts
  118.0s  src/providers/adapters/openai-compat-sse.ts
  118.0s  src/providers/index.ts
  118.0s  src/providers/adapters/openai-compat.ts
  118.0s  src/providers/fake.ts
  152.7s  src/tokenizers/backends/tekken.ts
  153.6s  src/tokenizers/backends/tiktoken.ts
  154.2s  src/tokenizers/chat-format.ts
  155.8s  src/tokenizers/backends/tekken.ts
  155.8s  src/tokenizers/count.ts
  155.8s  src/tokenizers/backends/tiktoken.ts
  155.8s  src/tokenizers/chat-format.ts
  158.0s  src/tokenizers/backends/tiktoken.ts
  158.0s  src/tokenizers/chat-format.ts
  158.0s  src/tokenizers/count.ts
  158.0s  src/tokenizers/backends/tekken.ts
  162.2s  src/tokenizers/chat-format.ts
  162.2s  src/tokenizers/count.ts
  162.2s  src/tokenizers/backends/tiktoken.ts
  162.2s  src/tokenizers/backends/tekken.ts
  170.6s  src/tokenizers/backends/tiktoken.ts
  170.6s  src/tokenizers/backends/tekken.ts
  170.6s  src/tokenizers/chat-format.ts
  170.6s  src/tokenizers/count.ts
  186.8s  src/tokenizers/count.ts
  186.8s  src/tokenizers/chat-format.ts
  186.8s  src/tokenizers/backends/tiktoken.ts
  186.8s  src/tokenizers/backends/tekken.ts
```

### Terminal failures

```
   34.2s start    37.0s spent   6 requests  src/cli/render/transcript-record.ts
   35.1s start    37.0s spent   6 requests  src/cli/render/transcript-renderer.ts
   35.9s start    37.1s spent   6 requests  src/cli/render/transcript-replay.ts
  152.7s start    37.4s spent   6 requests  src/tokenizers/backends/tekken.ts
  153.5s start    36.0s spent   6 requests  src/tokenizers/backends/tiktoken.ts
  154.2s start    34.7s spent   6 requests  src/tokenizers/chat-format.ts
```

Requests per file: min 1 · median 1 · max 6.
A file that never hits a limit sends 1; anything above that is retry traffic.

