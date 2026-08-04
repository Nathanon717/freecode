# Dead code — mistral:mistral-medium-latest

111 files · 84 ok · 27 dead · 9m02s

## src/agent/parsed-tools.ts

- [unexport] ParsedToolsResult — the interface has 0 external code references and is only used internally in this file

## src/agent/stream-turn.ts

- [unexport] `RecoveringStreamOptions` — no external references, only used internally in the function signature
- [unexport] `RecoveringStreamOutcome` — no external references, only used internally as the return type

## src/agent/subagents/run-subagent.ts

- [unexport] SubAgentContext — no code outside this file references the type, only documentation does

## src/agent/workspace.ts

- [unexport] ResolvedProjectPath — interface is only referenced in this file and documentation, not used by name elsewhere

## src/cli/chrome/toggles.ts

- [unexport] AskMode — type is only referenced inside this file and in docs, with no external code usage

## src/cli/command-dispatcher.ts

- [unexport] `CommandDispatchResult` — type is only referenced in this file (line 161) and in docs, with no external code usage.

## src/cli/headless-prompt.ts

- [unexport] HeadlessPromptOptions — the interface is only referenced in this file (line 77) and in docs, with no external code references.

## src/cli/menus/action-menu.ts

- [unexport] ActionMenuResult — the type is only referenced inside this file (line 34) and in docs, with no external code references.

## src/cli/menus/list-menu.ts

- [unexport] `ListMenuOptions` — the interface is only referenced in this file (line 182) and in docs, with no external code references.

## src/cli/menus/menu-shell.ts

- [unexport] MenuShellOptions — the interface is only referenced in this file and in documentation, not used elsewhere in code.

## src/cli/menus/raw-picker.ts

- [unexport] `RawKeySessionCallbacks` — 0 code references outside this file, only used internally by `runRawKeySession`
- [unexport] `RawKeySession` — 0 code references outside this file, only used internally by `runRawKeySession`
- [unexport] `RawPickerOptions` — 0 code references outside this file, only used internally by `runRawPicker`

## src/cli/render/markdown-renderer.ts

- [unexport] `MarkdownStreamRenderer` — the interface is only referenced in this file (line 451) and in docs, with no external code references.

## src/cli/render/transcript-record.ts

- [unexport] TranscriptEntry — type is only referenced inside this file and in docs, never used by name elsewhere
- [unexport] TranscriptRecord — interface is only referenced inside this file and in docs, never used by name elsewhere

## src/cli/render/transcript-renderer.ts

- [unexport] `formatParsedToolCallLine` — re-exported but only referenced in its own source file (transcript-format.ts) and docs, with no external code usage
- [unexport] `formatRationaleLine` — re-exported but only referenced in its own source file (transcript-format.ts) and tests for that file, with no external code usage
- [unexport] `formatTranscriptStepDivider` — re-exported but only referenced in its own source file (transcript-format.ts) and tests for that file, with no external code usage
- [dead] `renderToolStep` — exported function with 0 external code references, only used internally in this file (line 394)

## src/cli/tools/tool-approval.ts

- [unexport] ToolApprovalChoice — type is only referenced within this file and in docs, never imported elsewhere

## src/cli/tools/tool-invocation.ts

- [unexport] ToolParam — 0 external references, only used internally
- [unexport] HighlightRange — 0 external references, only used internally
- [unexport] ParsedInvocation — 0 external references, only used internally
- [unexport] FieldSlot — 0 external references, only used internally
- [unexport] toolCallSlots — 0 external references, only used internally

## src/eval/errors.ts

- [unexport] ApiError — the interface is only referenced within this file and in docs, but not imported elsewhere.

## src/eval/runner.ts

- [unexport] EvalToolCall — interface has 0 code references outside this file, only used internally
- [unexport] EvalTokenUsage — interface has 0 code references outside this file, only used internally

## src/providers/adapters/adapter-http-retry.ts

- [unexport] `FetchWithRetryOptions` — interface has 0 code references outside this file and is only used internally in `fetchWithRetry`

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] OpenAICompatQuirks — the interface is only referenced within this file (line 23) and in docs, with no external code usage.

## src/providers/fake.ts

- [unexport] `FAKE_DEFAULT_MODEL_ID` — exported but only used internally (line 112) and only documented, not referenced by other code
- [unexport] `FakeUsage` — exported but only used internally and only documented
- [unexport] `FakeModelCall` — exported but only used internally and only documented
- [unexport] `FakeModelResult` — exported but only used internally and only documented
- [unexport] `FakeToolCall` — exported but only used internally and only documented
- [unexport] `FakeNativeModelSettings` — exported but only used internally (line 272) and only documented

## src/providers/model-data.ts

- [unexport] `ObservedRateLimits` — interface has 0 external code references, only used internally in `ModelEntry` and documented in docs
- [unexport] `CatalogModel` — interface has 0 external code references, only used internally in `saveProviderCatalog`/`getProviderCatalog` and documented in docs

## src/providers/pricing-verifier.ts

- [unexport] VerifiedRates — exported but only used internally, no external references
- [unexport] LITELLM_PRICING_URL — exported but only used internally, no external references
- [unexport] OPENROUTER_MODELS_URL — exported but only used internally, no external references
- [unexport] getLiteLLMRates — exported but only used internally, no external references
- [unexport] getOpenRouterRates — exported but only used internally, no external references
- [unexport] getVerifiedRates — exported but only used internally, no external references

## src/providers/quota/headers.ts

- [unexport] GroqRateLimitHeaders — 0 code references outside this file, only used internally and in docs
- [unexport] GroqRateLimitInfo — 0 code references outside this file, only used internally and in docs
- [unexport] RateLimitBucket — 0 code references outside this file, only used internally and in docs
- [dead] headerNum — private helper not exported, but never used (parseMistralRateLimitSnapshot and parseCerebrasRateLimitSnapshot use the same logic inline)

## src/providers/types.ts

- [unexport] RateLimits — interface has 0 code references outside this file, only used internally in ModelConfig

## src/store/model-list-cache.ts

- [unexport] RawCachedModel — interface has 0 code references outside this file, only used internally
- [unexport] CacheUpdateResult — interface has 0 code references outside this file, only used internally

## src/util/errors.ts

- [unexport] `isNoSuchToolError` — exported but only used internally (line 226) and only documented, not referenced elsewhere
- [unexport] `noSuchToolName` — exported but only used internally (line 227) and only documented, not referenced elsewhere
- [unexport] `noSuchToolAvailableList` — exported but only used internally (line 228) and only documented, not referenced elsewhere
- [unexport] `isInvalidToolArgumentsError` — exported but only used internally (line 238) and only documented, not referenced elsewhere
- [unexport] `invalidToolName` — exported but only used internally (line 239) and only documented, not referenced elsewhere

## HTTP diagnostics

- requests: 461 for 111 files (200×111 · 429×350)
- 429 responses: 350 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/350
- backoff waits: 541, 1713.9s summed across workers (not wall time)
- successful call latency: median 1.3s · max 5.1s
- rate-limit headers on 429s: 350/350 carried them — req remaining 0 of limit 50, tokens remaining 0 of limit 25000
- 429 window: 13.0s → 522.3s into the run

### 429 timeline (seconds into run)

```
   13.0s  src/agent/tools/grep.ts
   13.9s  src/agent/tools/index.ts
   14.6s  src/agent/tools/list-dir.ts
   15.4s  src/agent/tools/read.ts
   16.6s  src/agent/tools/list-dir.ts
   16.6s  src/agent/tools/read.ts
   16.6s  src/agent/tools/index.ts
   16.6s  src/agent/tools/grep.ts
   18.7s  src/agent/tools/read.ts
   18.7s  src/agent/tools/index.ts
   18.7s  src/agent/tools/list-dir.ts
   18.7s  src/agent/tools/grep.ts
   22.9s  src/agent/tools/index.ts
   22.9s  src/agent/tools/grep.ts
   22.9s  src/agent/tools/list-dir.ts
   22.9s  src/agent/tools/read.ts
   31.2s  src/agent/tools/list-dir.ts
   31.3s  src/agent/tools/read.ts
   31.2s  src/agent/tools/grep.ts
   31.2s  src/agent/tools/index.ts
   49.6s  src/agent/tools/shell.ts
   50.2s  src/agent/tools/spawn-agent.ts
   51.0s  src/agent/tools/tool-names.ts
   51.7s  src/agent/turn-messages.ts
   52.9s  src/agent/tools/spawn-agent.ts
   52.9s  src/agent/turn-messages.ts
   52.9s  src/agent/tools/tool-names.ts
   52.9s  src/agent/tools/shell.ts
   55.0s  src/agent/turn-messages.ts
   55.1s  src/agent/tools/shell.ts
   55.0s  src/agent/tools/tool-names.ts
   55.0s  src/agent/tools/spawn-agent.ts
   59.1s  src/agent/turn-messages.ts
   59.2s  src/agent/tools/tool-names.ts
   59.2s  src/agent/tools/shell.ts
   59.2s  src/agent/tools/spawn-agent.ts
   69.6s  src/agent/usage-finalize.ts
   70.6s  src/agent/workspace.ts
   71.5s  src/cli/chrome/ansi.ts
   72.3s  src/cli/chrome/bottom-ui.ts
   73.4s  src/cli/chrome/ansi.ts
   73.4s  src/agent/usage-finalize.ts
   73.4s  src/agent/workspace.ts
   73.4s  src/cli/chrome/bottom-ui.ts
   75.6s  src/cli/chrome/ansi.ts
   75.6s  src/agent/usage-finalize.ts
   75.6s  src/agent/workspace.ts
   75.6s  src/cli/chrome/bottom-ui.ts
   79.7s  src/agent/workspace.ts
   79.8s  src/agent/usage-finalize.ts
   79.8s  src/cli/chrome/bottom-ui.ts
   79.8s  src/cli/chrome/ansi.ts
   89.6s  src/cli/chrome/footer-status.ts
   90.3s  src/cli/chrome/input-buffer.ts
   91.0s  src/cli/chrome/toggles.ts
   91.6s  src/cli/command-dispatcher.ts
   92.8s  src/cli/chrome/input-buffer.ts
   92.8s  src/cli/chrome/footer-status.ts
   92.8s  src/cli/chrome/toggles.ts
   92.8s  src/cli/command-dispatcher.ts
   95.0s  src/cli/chrome/input-buffer.ts
   95.0s  src/cli/chrome/footer-status.ts
   95.0s  src/cli/chrome/toggles.ts
   95.0s  src/cli/command-dispatcher.ts
   99.2s  src/cli/command-dispatcher.ts
   99.2s  src/cli/chrome/toggles.ts
   99.2s  src/cli/chrome/footer-status.ts
   99.2s  src/cli/chrome/input-buffer.ts
  109.5s  src/cli/eval/custom-eval-menu.ts
  110.2s  src/cli/eval/eval-dots.ts
  111.5s  src/cli/eval/eval-screen.ts
  112.6s  src/cli/eval/eval-menu.ts
  112.6s  src/cli/eval/custom-eval-menu.ts
  112.6s  src/cli/eval/eval-dots.ts
  112.6s  src/cli/eval/eval-screen.ts
  114.8s  src/cli/eval/eval-dots.ts
  114.8s  src/cli/eval/eval-menu.ts
  114.7s  src/cli/eval/custom-eval-menu.ts
  114.8s  src/cli/eval/eval-screen.ts
  118.9s  src/cli/eval/eval-screen.ts
  118.9s  src/cli/eval/custom-eval-menu.ts
  118.9s  src/cli/eval/eval-dots.ts
  118.9s  src/cli/eval/eval-menu.ts
  127.3s  src/cli/eval/eval-screen.ts
  127.3s  src/cli/eval/eval-menu.ts
  127.3s  src/cli/eval/eval-dots.ts
  127.3s  src/cli/eval/custom-eval-menu.ts
  145.1s  src/cli/eval/humaneval-menu.ts
  145.9s  src/cli/headless-prompt.ts
  146.6s  src/cli/menus/action-menu.ts
  150.0s  src/cli/menus/menu-shell.ts
  151.0s  src/cli/menus/model-screen.ts
  151.7s  src/cli/menus/raw-picker.ts
  152.4s  src/cli/render/banner.ts
  153.6s  src/cli/menus/menu-shell.ts
  153.6s  src/cli/render/banner.ts
  153.6s  src/cli/menus/raw-picker.ts
  153.6s  src/cli/menus/model-screen.ts
  155.7s  src/cli/menus/raw-picker.ts
  155.8s  src/cli/render/banner.ts
  155.8s  src/cli/menus/menu-shell.ts
  155.8s  src/cli/menus/model-screen.ts
  160.1s  src/cli/render/banner.ts
  160.0s  src/cli/menus/raw-picker.ts
  160.1s  src/cli/menus/model-screen.ts
  160.1s  src/cli/menus/menu-shell.ts
  168.4s  src/cli/menus/raw-picker.ts
  168.4s  src/cli/menus/model-screen.ts
  168.5s  src/cli/render/banner.ts
  168.5s  src/cli/menus/menu-shell.ts
  186.5s  src/cli/render/markdown-renderer.ts
  187.2s  src/cli/render/transcript-format.ts
  187.9s  src/cli/render/transcript-options.ts
  188.7s  src/cli/render/transcript-record.ts
  189.9s  src/cli/render/transcript-options.ts
  189.9s  src/cli/render/transcript-format.ts
  189.9s  src/cli/render/transcript-record.ts
  189.9s  src/cli/render/markdown-renderer.ts
  193.4s  src/cli/render/transcript-renderer.ts
  194.0s  src/cli/render/transcript-replay.ts
  194.8s  src/cli/scripted-mode.ts
  195.5s  src/cli/session-modes.ts
  196.7s  src/cli/scripted-mode.ts
  196.7s  src/cli/render/transcript-replay.ts
  196.7s  src/cli/render/transcript-renderer.ts
  196.7s  src/cli/session-modes.ts
  198.8s  src/cli/render/transcript-replay.ts
  198.9s  src/cli/scripted-mode.ts
  198.9s  src/cli/session-modes.ts
  198.8s  src/cli/render/transcript-renderer.ts
  203.1s  src/cli/render/transcript-replay.ts
  203.1s  src/cli/scripted-mode.ts
  203.1s  src/cli/render/transcript-renderer.ts
  203.1s  src/cli/session-modes.ts
  211.5s  src/cli/scripted-mode.ts
  211.5s  src/cli/render/transcript-replay.ts
  211.5s  src/cli/render/transcript-renderer.ts
  211.5s  src/cli/session-modes.ts
  229.7s  src/cli/session-runner.ts
  230.4s  src/cli/slash-commands.ts
  231.0s  src/cli/stdout-retry-sink.ts
  232.9s  src/cli/session-runner.ts
  232.9s  src/cli/stdout-retry-sink.ts
  232.9s  src/cli/slash-commands.ts
  232.9s  src/cli/tools/tool-approval.ts
  235.0s  src/cli/stdout-retry-sink.ts
  235.1s  src/cli/slash-commands.ts
  235.1s  src/cli/session-runner.ts
  235.1s  src/cli/tools/tool-approval.ts
  239.2s  src/cli/stdout-retry-sink.ts
  239.2s  src/cli/session-runner.ts
  239.2s  src/cli/slash-commands.ts
  239.2s  src/cli/tools/tool-approval.ts
  248.6s  src/cli/tools/tool-invocation.ts
  249.3s  src/cli/tools/tool-runner.ts
  250.1s  src/commands/config.ts
  250.6s  src/commands/model.ts
  251.8s  src/cli/tools/tool-runner.ts
  251.8s  src/commands/config.ts
  251.8s  src/cli/tools/tool-invocation.ts
  251.8s  src/commands/model.ts
  254.0s  src/cli/tools/tool-invocation.ts
  254.1s  src/cli/tools/tool-runner.ts
  254.1s  src/commands/config.ts
  254.1s  src/commands/model.ts
  258.3s  src/commands/config.ts
  258.3s  src/cli/tools/tool-runner.ts
  258.3s  src/cli/tools/tool-invocation.ts
  258.3s  src/commands/model.ts
  268.3s  src/commands/renderer.ts
  268.9s  src/commands/status.ts
  269.5s  src/config/index.ts
  270.2s  src/eval/custom.ts
  271.4s  src/commands/status.ts
  271.3s  src/eval/custom.ts
  271.3s  src/commands/renderer.ts
  271.3s  src/config/index.ts
  273.5s  src/eval/custom.ts
  273.5s  src/commands/status.ts
  273.5s  src/commands/renderer.ts
  273.6s  src/config/index.ts
  277.7s  src/config/index.ts
  277.7s  src/eval/custom.ts
  277.7s  src/commands/renderer.ts
  277.7s  src/commands/status.ts
  286.1s  src/eval/custom.ts
  286.1s  src/commands/status.ts
  286.0s  src/config/index.ts
  286.1s  src/commands/renderer.ts
  304.2s  src/eval/errors.ts
  304.9s  src/eval/history.ts
  305.6s  src/eval/humaneval-data.ts
  307.3s  src/eval/history.ts
  307.3s  src/eval/errors.ts
  307.3s  src/eval/result-sink.ts
  307.3s  src/eval/humaneval-data.ts
  309.4s  src/eval/history.ts
  309.4s  src/eval/errors.ts
  309.4s  src/eval/result-sink.ts
  309.4s  src/eval/humaneval-data.ts
  314.9s  src/eval/runner.ts
  315.6s  src/index.ts
  316.3s  src/logger.ts
  316.9s  src/providers/adapters/adapter-http-retry.ts
  318.1s  src/providers/adapters/adapter-http-retry.ts
  318.1s  src/eval/runner.ts
  318.0s  src/index.ts
  318.1s  src/logger.ts
  320.2s  src/index.ts
  320.2s  src/eval/runner.ts
  320.2s  src/providers/adapters/adapter-http-retry.ts
  320.2s  src/logger.ts
  325.6s  src/providers/adapters/adapter-usage-capture.ts
  326.2s  src/providers/adapters/openai-compat-quirks.ts
  326.8s  src/providers/adapters/openai-compat-request.ts
  328.4s  src/providers/adapters/openai-compat-sse.ts
  328.4s  src/providers/adapters/adapter-usage-capture.ts
  328.4s  src/providers/adapters/openai-compat-quirks.ts
  328.4s  src/providers/adapters/openai-compat-request.ts
  330.6s  src/providers/adapters/adapter-usage-capture.ts
  330.6s  src/providers/adapters/openai-compat-quirks.ts
  330.6s  src/providers/adapters/openai-compat-request.ts
  330.6s  src/providers/adapters/openai-compat-sse.ts
  334.7s  src/providers/adapters/adapter-usage-capture.ts
  334.7s  src/providers/adapters/openai-compat-quirks.ts
  334.7s  src/providers/adapters/openai-compat-sse.ts
  334.7s  src/providers/adapters/openai-compat-request.ts
  344.2s  src/providers/adapters/openai-compat.ts
  345.0s  src/providers/fake.ts
  345.6s  src/providers/index.ts
  346.3s  src/providers/model-data.ts
  347.5s  src/providers/adapters/openai-compat.ts
  347.5s  src/providers/fake.ts
  347.5s  src/providers/model-data.ts
  347.5s  src/providers/index.ts
  349.7s  src/providers/adapters/openai-compat.ts
  349.7s  src/providers/fake.ts
  349.7s  src/providers/index.ts
  349.7s  src/providers/model-data.ts
  355.1s  src/providers/model-quirks.ts
  355.8s  src/providers/model-settings-accessor.ts
  357.4s  src/providers/model-quirks.ts
  357.4s  src/providers/model-settings-accessor.ts
  357.4s  src/providers/openai-daily-spend.ts
  359.6s  src/providers/model-settings-accessor.ts
  359.6s  src/providers/paid-guard.ts
  359.5s  src/providers/openai-daily-spend.ts
  359.5s  src/providers/model-quirks.ts
  363.8s  src/providers/model-settings-accessor.ts
  363.8s  src/providers/paid-guard.ts
  363.8s  src/providers/openai-daily-spend.ts
  363.8s  src/providers/model-quirks.ts
  372.1s  src/providers/openai-daily-spend.ts
  372.1s  src/providers/paid-guard.ts
  372.2s  src/providers/model-settings-accessor.ts
  372.1s  src/providers/model-quirks.ts
  389.9s  src/providers/pricing-verifier.ts
  390.6s  src/providers/provider-catalog.ts
  392.0s  src/providers/quota/cache.ts
  392.0s  src/providers/provider-registry.ts
  392.0s  src/providers/pricing-verifier.ts
  394.5s  src/providers/pricing-verifier.ts
  394.5s  src/providers/provider-catalog.ts
  394.5s  src/providers/quota/cache.ts
  394.5s  src/providers/provider-registry.ts
  400.1s  src/providers/quota/headers.ts
  400.9s  src/providers/types.ts
  401.6s  src/providers/user-blocklist.ts
  402.7s  src/providers/user-blocklist.ts
  402.7s  src/providers/types.ts
  402.7s  src/store/call-log.ts
  402.7s  src/providers/quota/headers.ts
  404.9s  src/providers/user-blocklist.ts
  404.9s  src/store/call-log.ts
  404.9s  src/providers/types.ts
  404.9s  src/providers/quota/headers.ts
  409.0s  src/providers/user-blocklist.ts
  409.1s  src/providers/quota/headers.ts
  409.1s  src/providers/types.ts
  409.1s  src/store/call-log.ts
  417.3s  src/providers/user-blocklist.ts
  417.3s  src/store/call-log.ts
  417.3s  src/providers/types.ts
  417.3s  src/providers/quota/headers.ts
  435.0s  src/store/db-config-cache.ts
  435.6s  src/store/db-load.ts
  437.4s  src/store/db-load.ts
  437.4s  src/store/db-types.ts
  437.5s  src/store/db-schema.ts
  437.4s  src/store/db-config-cache.ts
  439.7s  src/store/db-schema.ts
  439.7s  src/store/db-types.ts
  439.7s  src/store/db-config-cache.ts
  439.7s  src/store/db-load.ts
  443.8s  src/store/db-load.ts
  443.8s  src/store/db-config-cache.ts
  443.8s  src/store/db-schema.ts
  443.8s  src/store/db-types.ts
  453.4s  src/store/db.ts
  454.0s  src/store/model-list-cache.ts
  454.6s  src/store/store-paths.ts
  455.2s  src/tokenizers/backends/bpe-json.ts
  456.4s  src/store/model-list-cache.ts
  456.4s  src/store/store-paths.ts
  456.4s  src/tokenizers/backends/bpe-json.ts
  456.4s  src/store/db.ts
  458.8s  src/store/model-list-cache.ts
  458.8s  src/store/db.ts
  458.8s  src/tokenizers/backends/bpe-json.ts
  458.8s  src/store/store-paths.ts
  464.3s  src/tokenizers/backends/tekken.ts
  464.8s  src/tokenizers/backends/tiktoken.ts
  465.5s  src/tokenizers/chat-format.ts
  466.2s  src/tokenizers/count.ts
  467.3s  src/tokenizers/count.ts
  467.3s  src/tokenizers/chat-format.ts
  467.3s  src/tokenizers/backends/tiktoken.ts
  467.3s  src/tokenizers/backends/tekken.ts
  469.4s  src/tokenizers/chat-format.ts
  469.5s  src/tokenizers/backends/tiktoken.ts
  469.5s  src/tokenizers/backends/tekken.ts
  469.5s  src/tokenizers/count.ts
  473.6s  src/tokenizers/count.ts
  473.6s  src/tokenizers/backends/tekken.ts
  473.6s  src/tokenizers/chat-format.ts
  473.7s  src/tokenizers/backends/tiktoken.ts
  482.3s  src/tokenizers/backends/tekken.ts
  482.3s  src/tokenizers/count.ts
  482.3s  src/tokenizers/backends/tiktoken.ts
  482.3s  src/tokenizers/chat-format.ts
  501.2s  src/tokenizers/model-family.ts
  501.8s  src/util/errors.ts
  505.2s  src/util/line-numbers.ts
  505.8s  src/util/screen-buffer.ts
  506.5s  src/util/text-encoding.ts
  507.6s  src/util/line-numbers.ts
  507.6s  src/util/text-encoding.ts
  507.6s  src/util/screen-buffer.ts
  509.8s  src/util/wrap-rows.ts
  509.8s  src/util/text-encoding.ts
  509.8s  src/util/screen-buffer.ts
  509.8s  src/util/line-numbers.ts
  514.0s  src/util/screen-buffer.ts
  514.0s  src/util/line-numbers.ts
  514.0s  src/util/text-encoding.ts
  514.0s  src/util/wrap-rows.ts
  522.3s  src/util/wrap-rows.ts
  522.3s  src/util/screen-buffer.ts
  522.4s  src/util/line-numbers.ts
  522.3s  src/util/text-encoding.ts
```

Requests per file: min 1 · median 5 · max 6.
A file that never hits a limit sends 1; anything above that is retry traffic.

