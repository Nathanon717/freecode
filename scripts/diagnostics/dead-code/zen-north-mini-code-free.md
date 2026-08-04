# Dead code — zen:north-mini-code-free

111 files · 46 ok · 17 dead · 39 error · 9 unparsed · 38m29s

## src/agent/conversation.ts

- [dead] projectRoot — readonly property never read in the class and not referenced elsewhere (reference table lists only `Conversation`).
- [dead] clearMessages — method never called in the class and not referenced elsewhere (reference table lists only `Conversation`).

## src/agent/fake-loop.ts — ERROR

The operation was aborted due to timeout

## src/agent/loop.ts — ERROR

The operation was aborted due to timeout

## src/agent/parsed-tools.ts — ERROR

The operation was aborted due to timeout

## src/agent/stream-turn.ts

- [unexport] RecoveringStreamOptions — exported but no external code references (reference table shows 0), only used internally (line 65)  
- [unexport] RecoveringStreamOutcome — exported but no external code references (reference table shows 0), only used internally (line 66)

## src/agent/subagents/run-subagent.ts — ERROR

The operation was aborted due to timeout

## src/agent/tools/edit-diff-context.ts — ERROR

The operation was aborted due to timeout

## src/agent/tools/edit.ts — ERROR

The operation was aborted due to timeout

## src/agent/tools/index.ts — ERROR

The operation was aborted due to timeout

## src/agent/tools/tool-names.ts — ERROR

The operation was aborted due to timeout

## src/agent/workspace.ts

- [unexport] ResolvedProjectPath — exported interface with zero external references; only used internally for type annotations in resolveProjectPath, resolveExistingProjectPath, and resolveWritableProjectPath.

## src/cli/chrome/bottom-ui.ts — ERROR

The operation was aborted due to timeout

## src/cli/chrome/footer-status.ts — ERROR

The operation was aborted due to timeout

## src/cli/chrome/toggles.ts

- [unexport] AskMode — exported type with zero external references (reference table shows 0 code references outside this file), only used internally.

## src/cli/command-dispatcher.ts

- [unexport] CommandDispatchResult — exported type used only inside this file; reference table shows 0 code references outside this file.

## src/cli/eval/custom-eval-menu.ts — ERROR

The operation was aborted due to timeout

## src/cli/eval/eval-menu.ts — ERROR

The operation was aborted due to timeout

## src/cli/eval/eval-screen.ts — UNPARSED

(empty response)

## src/cli/eval/humaneval-menu.ts — ERROR

The operation was aborted due to timeout

## src/cli/headless-prompt.ts

- [unexport] HeadlessPromptOptions — exported interface not referenced outside this file (reference table shows 0 external references), but used inside the file (as options parameter). Removing the export makes it internal.

## src/cli/menus/action-menu.ts

- [unexport] ActionMenuResult — exported type with 0 external references (only used inside this file, e.g., handleKey return type). Remove export keyword.
- [dead] InlineActionMenu.reset — method never referenced outside this file (no identifier matches). Unused method can be deleted.

## src/cli/menus/list-menu.ts

- [unexport] ListMenuOptions — exported but no external references; only used internally (line 182). The reference table shows 0 code references outside this file.

## src/cli/menus/menu-shell.ts

- [unexport] MenuShellOptions — exported interface not referenced outside this file (reference table shows 0 external code references), only used locally in runMenuShell signature.

## src/cli/menus/model-screen.ts — ERROR

The operation was aborted due to timeout

## src/cli/menus/raw-picker.ts

- [unexport] RawKeySessionCallbacks — exported interface with zero code references outside the file (reference table). No external code uses it, so it can be unexported.
- [unexport] RawKeySession — exported interface with zero code references outside the file (reference table). No external code uses it, so it can be unexported.
- [unexport] RawPickerOptions — exported interface with zero code references outside the file (reference table). No external code uses it, so it can be unexported.

## src/cli/render/banner.ts — ERROR

The operation was aborted due to timeout

## src/cli/render/markdown-renderer.ts

- [unexport] MarkdownStreamRenderer — exported interface with no external references; only used internally as return type of createMarkdownStreamRenderer.

## src/cli/render/transcript-format.ts — UNPARSED

(empty response)

## src/cli/render/transcript-record.ts

- [unexport] TranscriptEntry — exported type with zero external references (reference table shows 0 code references outside this file), but used internally (entries, getTranscriptRecord, grow, recordTranscriptPrompt). So can be unexported.
- [unexport] TranscriptRecord — exported interface with zero external references (reference table shows 0 code references outside this file), but used internally (as return type of getTranscriptRecord). So can be unexported.

## src/cli/render/transcript-renderer.ts — ERROR

The operation was aborted due to timeout

## src/cli/render/transcript-replay.ts — ERROR

The operation was aborted due to timeout

## src/cli/session-modes.ts — ERROR

The operation was aborted due to timeout

## src/cli/slash-commands.ts — ERROR

The operation was aborted due to timeout

## src/cli/stdout-retry-sink.ts — ERROR

The operation was aborted due to timeout

## src/cli/tools/tool-approval.ts — ERROR

The operation was aborted due to timeout

## src/cli/tools/tool-invocation.ts — UNPARSED

(empty response)

## src/cli/tools/tool-runner.ts — ERROR

The operation was aborted due to timeout

## src/commands/config.ts — ERROR

The operation was aborted due to timeout

## src/commands/model.ts — ERROR

The operation was aborted due to timeout

## src/config/index.ts — UNPARSED

(empty response)

## src/eval/errors.ts

- [unexport] ApiError — exported interface not referenced outside this file (reference table shows 0 code references), only used internally; can be unexported.

## src/eval/runner.ts

- [unexport] EvalToolCall — exported interface used only internally; reference table shows 0 external references.
- [unexport] EvalTokenUsage — exported interface used only internally; reference table shows 0 external references.

## src/index.ts — ERROR

The operation was aborted due to timeout

## src/providers/adapters/adapter-http-retry.ts — ERROR

The operation was aborted due to timeout

## src/providers/adapters/openai-compat-quirks.ts — ERROR

The operation was aborted due to timeout

## src/providers/adapters/openai-compat-sse.ts — ERROR

The operation was aborted due to timeout

## src/providers/adapters/openai-compat.ts — ERROR

The operation was aborted due to timeout

## src/providers/fake.ts

- [unexport] FAKE_DEFAULT_MODEL_ID — exported constant used only inside this file (line 112) and no external references (reference table shows 0 code references outside).
- [unexport] FakeUsage — exported interface used only inside this file (lines 33, 72, 90) and no external references (reference table shows 0 code references outside).
- [unexport] FakeModelCall — exported interface used only inside this file (lines 194, 295, 378) and no external references (reference table shows 0 code references outside).
- [unexport] FakeModelResult — exported interface used only inside this file (line 378) and no external references (reference table shows 0 code references outside).
- [unexport] FakeToolCall — exported interface used only inside this file (lines 35, 73, 89, 128) and no external references (reference table shows 0 code references outside).

## src/providers/index.ts — UNPARSED

(empty response)

## src/providers/model-data.ts

- [unexport] ObservedRateLimits — exported interface used only inside this file (line 48) and not referenced elsewhere (0 external references).
- [unexport] CatalogModel — exported interface used only inside this file (lines 224, 244, 245) and not referenced elsewhere (0 external references).

## src/providers/provider-registry.ts — ERROR

The operation was aborted due to timeout

## src/providers/quota/headers.ts — ERROR

The operation was aborted due to timeout

## src/providers/types.ts

- [unexport] RateLimits — exported but only used within this file (line 13) and no external code references (reference table shows 0 external references).

## src/store/db-load.ts — ERROR

The operation was aborted due to timeout

## src/store/db-schema.ts — ERROR

The operation was aborted due to timeout

## src/store/db.ts — UNPARSED

(empty response)

## src/store/model-list-cache.ts — UNPARSED

(empty response)

## src/store/store-paths.ts — UNPARSED

(empty response)

## src/tokenizers/chat-format.ts — ERROR

The operation was aborted due to timeout

## src/tokenizers/count.ts — UNPARSED

(empty response)

## src/tokenizers/download-tokenizer.ts — ERROR

The operation was aborted due to timeout

## src/tokenizers/model-family.ts — ERROR

The operation was aborted due to timeout

## src/util/errors.ts — ERROR

The operation was aborted due to timeout

## src/util/line-diff.ts — ERROR

The operation was aborted due to timeout

## src/util/screen-buffer.ts — ERROR

The operation was aborted due to timeout

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 39 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.1s · max 7.8s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

### Terminal failures

```
    0.0s start   300.8s spent   1 requests  src/agent/fake-loop.ts
    0.0s start   301.7s spent   1 requests  src/agent/loop.ts
    0.0s start   302.3s spent   1 requests  src/agent/parsed-tools.ts
    0.0s start   303.0s spent   1 requests  src/agent/subagents/run-subagent.ts
   65.3s start   300.8s spent   1 requests  src/agent/tools/edit-diff-context.ts
   75.3s start   300.6s spent   1 requests  src/agent/tools/edit.ts
  196.6s start   300.5s spent   1 requests  src/agent/tools/index.ts
  302.4s start   300.7s spent   1 requests  src/agent/tools/tool-names.ts
  366.1s start   300.6s spent   1 requests  src/cli/chrome/bottom-ui.ts
  366.8s start   300.6s spent   1 requests  src/cli/chrome/footer-status.ts
  402.4s start   300.8s spent   1 requests  src/cli/eval/custom-eval-menu.ts
  456.2s start   300.9s spent   1 requests  src/cli/eval/eval-menu.ts
  497.1s start   300.6s spent   1 requests  src/cli/eval/humaneval-menu.ts
  657.6s start   300.9s spent   1 requests  src/cli/menus/model-screen.ts
  667.4s start   300.7s spent   1 requests  src/cli/render/banner.ts
  778.5s start   301.1s spent   1 requests  src/cli/render/transcript-renderer.ts
  787.3s start   300.6s spent   1 requests  src/cli/render/transcript-replay.ts
  854.0s start   301.6s spent   1 requests  src/cli/session-modes.ts
  898.4s start   301.0s spent   1 requests  src/cli/slash-commands.ts
  954.1s start   301.4s spent   1 requests  src/cli/stdout-retry-sink.ts
  958.5s start   300.9s spent   1 requests  src/cli/tools/tool-approval.ts
  970.1s start   300.7s spent   1 requests  src/cli/tools/tool-runner.ts
 1079.6s start   300.8s spent   1 requests  src/commands/config.ts
 1087.9s start   300.6s spent   1 requests  src/commands/model.ts
 1295.4s start   301.0s spent   1 requests  src/index.ts
 1329.2s start   300.6s spent   1 requests  src/providers/adapters/adapter-http-retry.ts
 1339.9s start   300.7s spent   1 requests  src/providers/adapters/openai-compat-quirks.ts
 1380.3s start   300.6s spent   1 requests  src/providers/adapters/openai-compat-sse.ts
 1388.5s start   300.6s spent   1 requests  src/providers/adapters/openai-compat.ts
 1640.6s start   300.6s spent   1 requests  src/providers/provider-registry.ts
 1677.1s start   300.8s spent   1 requests  src/providers/quota/headers.ts
 1723.6s start   300.6s spent   1 requests  src/store/db-load.ts
 1740.0s start   300.8s spent   1 requests  src/store/db-schema.ts
 1921.3s start   301.1s spent   1 requests  src/tokenizers/chat-format.ts
 1941.1s start   300.6s spent   1 requests  src/tokenizers/download-tokenizer.ts
 1952.0s start   300.8s spent   1 requests  src/tokenizers/model-family.ts
 1963.6s start   300.6s spent   1 requests  src/util/errors.ts
 1989.9s start   300.8s spent   1 requests  src/util/line-diff.ts
 2008.9s start   300.6s spent   1 requests  src/util/screen-buffer.ts
```

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

