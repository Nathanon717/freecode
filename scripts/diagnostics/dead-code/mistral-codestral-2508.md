# Dead code — mistral:codestral-2508

111 files · 89 ok · 22 dead · 1m34s

## src/agent/loop.ts

- [dead] `systemPromptLogged` (line 28) — a mutable module-level variable that is never read.

## src/agent/stream-turn.ts

- [dead] `RecoveringStreamOptions` — the interface is only used inside this file and not referenced outside, and its only documentation is in `docs/`. The function signature is the only place it is needed, and callers build the value without ever writing the type name.
- [dead] `RecoveringStreamOutcome` — the interface is only used inside this file and not referenced outside, and its only documentation is in `docs/`. The function signature is the only place it is needed, and callers build the value without ever writing the type name.

## src/agent/subagents/registry.ts

- [dead] `EXPLORE_PROMPT` — the string is only used to initialize `AGENTS`, and the only reference to `AGENTS` is in this file. The `explore` persona is never used in the codebase, and the prompt is not referenced elsewhere.

## src/agent/tools/index.ts

- [dead] `appendToolTrace` — no references outside this file, and the file never calls it. The `FREECODE_TRACE_JSON` environment variable is not set in the code, so the function is never used.
- [dead] `ToolTraceEvent` — no references outside this file, and the file never uses it. The only use is in the `appendToolTrace` function, which is itself dead.

## src/cli/chrome/toggles.ts

- [dead] `AskMode` — the type is only used in this file, and its only references are in comments and documentation. The code does not use it at runtime.
- [dead] `hintRest` — the function is only used by `renderToggle`, which is only used by `composeToggleBar`, which is exported and used elsewhere. However, `hintRest` is not exported, and the only evidence of its use is in this file. Since it is not exported and its only use is in this file, it is dead code.
- [dead] `renderToggle` — the function is only used by `composeToggleBar`, which is exported and used elsewhere. However, `renderToggle` is not exported, and the only evidence of its use is in this file. Since it is not exported and its only use is in this file, it is dead code.

## src/cli/eval/humaneval-menu.ts

- [dead] `buildAgentPrompt` — no references outside this file, and the file never uses it. The function is only defined and never called.
- [dead] `askContinuePrompt` — no references outside this file, and the file never uses it. The function is only defined and never called.
- [dead] `RunStatus` — no references outside this file, and the file never uses it. The type is only defined and never referenced.
- [dead] `RunResult` — no references outside this file, and the file never uses it. The interface is only defined and never referenced.
- [dead] `TranscriptTurn` — no references outside this file, and the file never uses it. The interface is only defined and never referenced.
- [dead] `RetryStatusInfo` — no references outside this file, and the file never uses it. The interface is only defined and never referenced.

## src/cli/menus/list-menu.ts

- [dead] `ListMenuOptions` — no code references outside this file, and only used inside this file (line 182)

## src/cli/render/transcript-renderer.ts

- [dead] `renderToolStep` — no external references, and only used internally in this file (line 394).

## src/cli/slash-commands.ts

- [dead] `fuzzyMatch` — no references outside this file, and the file never uses it. The only caller is `getRawFilteredCommands`, which is itself unused outside this file.

## src/cli/tools/tool-approval.ts

- [dead] `ToolApprovalChoice` — nothing outside the file references the symbol, and the file itself uses it only in type annotations and return types. The type is never instantiated or used in runtime logic.

## src/cli/tools/tool-invocation.ts

- [dead] `ToolParam` — interface used only inside this file, no external references
- [dead] `HighlightRange` — interface used only inside this file, no external references
- [dead] `ParsedInvocation` — interface used only inside this file, no external references
- [dead] `FieldSlot` — interface used only inside this file, no external references
- [dead] `toolCallSlots` — function used only inside this file, no external references

## src/commands/config.ts

- [dead] `Interface` — imported but never used in the file
- [dead] `BoolSetting` — interface defined but never used in the file
- [dead] `NumericSetting` — interface defined but never used in the file
- [dead] `Setting` — type defined but never used in the file
- [dead] `SETTINGS` — constant defined but never used in the file
- [dead] `Tab` — type defined but never used in the file
- [dead] `TabValue` — type defined but never used in the file
- [dead] `CYCLE_RIGHT` — constant defined but never used in the file
- [dead] `CYCLE_LEFT` — constant defined but never used in the file

## src/commands/model.ts

- [dead] `buildAllItemLines` — re-exported but never used in this file, and 31 external references prove it is live.

## src/eval/runner.ts

- [unexport] `EvalToolCall` — interface used only inside this file, no external references
- [unexport] `EvalTokenUsage` — interface used only inside this file, no external references

## src/providers/fake.ts

- [dead] FakeUsage — interface used only in this file, no external references
- [dead] FakeStepMatch — interface used only in this file, no external references
- [dead] FakeStepResponse — interface used only in this file, no external references
- [dead] FakeStep — interface used only in this file, no external references
- [dead] FakeFixture — interface used only in this file, no external references
- [dead] FakeTraceEntry — interface used only in this file, no external references
- [dead] isRecord — function used only in this file, no external references
- [dead] assertToolCall — function used only in this file, no external references
- [dead] readFixture — function used only in this file, no external references
- [dead] messageText — function used only in this file, no external references
- [dead] lastUserMessage — function used only in this file, no external references
- [dead] failMatch — function used only in this file, no external references
- [dead] assertStepMatches — function used only in this file, no external references
- [dead] appendTrace — function used only in this file, no external references
- [dead] lastUserMessageFromV1Prompt — function used only in this file, no external references
- [dead] systemPromptFromV1Prompt — function used only in this file, no external references

## src/providers/model-data.ts

- [dead] `ObservedRateLimits` — no code references outside this file, and only used internally in the file. The interface is unused.
- [dead] `CatalogModel` — no code references outside this file, and only used internally in the file. The interface is unused.

## src/providers/paid-guard.ts

- [dead] PAID_API_KEY_ENV_VARS — the const is only used to build PAID_API_KEY_ENV_VAR_SET, which is only used by isPaidApiKeyEnvVar. The latter is only used in tests, and the tests only check that the set contains the values from the const. The const itself is redundant.
- [dead] PAID_API_KEY_ENV_VAR_SET — the Set is only used by isPaidApiKeyEnvVar, which is only used in tests. The Set is built from PAID_API_KEY_ENV_VARS, which is itself only used to build the Set. The Set is redundant.
- [dead] isPaidApiKeyEnvVar — the function is only used in tests, and the tests only check that it returns true for the values in PAID_API_KEY_ENV_VARS. The function is redundant.

## src/providers/pricing-verifier.ts

- [dead] `VerifiedRates` — interface exported but never used outside this file, and only used internally for function signatures. The type is never referenced by name in the code.
- [dead] `LITELLM_PRICING_URL` — const exported but never used outside this file, and only used internally to fetch data.
- [dead] `OPENROUTER_MODELS_URL` — const exported but never used outside this file, and only used internally to fetch data.
- [dead] `getLiteLLMRates` — function exported but never used outside this file, and only used internally to fetch data.
- [dead] `getOpenRouterRates` — function exported but never used outside this file, and only used internally to fetch data.
- [dead] `getVerifiedRates` — function exported but never used outside this file, and only used internally to compute verified rates.

## src/providers/quota/headers.ts

- [dead] `headerNum` — a helper function used only inside `parseMistralRateLimitSnapshot` and `parseCerebrasRateLimitSnapshot`, which are both exported and used elsewhere.

## src/store/db.ts

- [dead] `DB_FILE_SUFFIXES` — a const array of strings used only in `wipeLocalDb`, which is itself used only in tests. The array is never referenced outside this file.

## src/store/model-list-cache.ts

- [dead] `RawCachedModel` — no code references outside this file, only used internally
- [dead] `CacheUpdateResult` — no code references outside this file, only used internally

## src/util/errors.ts

- [dead] `isNoSuchToolError` — the function is only used inside the file and has no external references.
- [dead] `noSuchToolName` — the function is only used inside the file and has no external references.
- [dead] `noSuchToolAvailableList` — the function is only used inside the file and has no external references.
- [dead] `isInvalidToolArgumentsError` — the function is only used inside the file and has no external references.
- [dead] `invalidToolName` — the function is only used inside the file and has no external references.

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 0 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.6s · max 10.9s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

