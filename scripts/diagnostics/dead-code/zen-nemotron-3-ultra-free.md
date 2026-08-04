# Dead code — zen:nemotron-3-ultra-free

111 files · 94 ok · 13 dead · 3 error · 1 unparsed · 10m23s

## src/agent/parsed-tools.ts — UNPARSED

<tool_call>([\s\S]*?)<\/tool_call>/g` - used, live.

- The `executeToolCalls` function - used by fake-loop.ts and internally, live.

- The `runParsedToolsLoop` function - exported and used, live.

- The `flattenToolMessagesToText` import - used in the function, live.

- All the transcript renderer imports - used in the function, live.

- The `log` and `logError` imports - used, live.

- The `renderMarkdown` import - used, live.

- The `createTools` import - used, live.

- The `ConfirmToolCall` type import - used in function signature, live.

- The `CoreMessage` and `LanguageModel` types - used, live.

- The `streamText` import - used, live.

- The `chalk` import - used, live.

Now, let me look for any dead branches, unused values, etc.:

In `parseToolCalls`:
- The `calls` array is built and returned - used.
- The regex match loop - used.
- The try/catch - used.
- The `logError` call - used.

In `executeToolCalls`:
- The `resultParts` array - used.
- The for loop - used.
- The `toolFn` lookup - used.
- The `toolResultStr` - used.
- The `if (!toolFn?.execute)` branch - this is a defensive check for unknown tools. The comment says "Available tools: ${Object.keys(tools).join(", ")}". This could be reached if the model calls an unknown tool. This is a defensive check against a state that can occur (model hallucinating a tool name), so it's not dead.

In `runParsedToolsLoop`:
- The `augSystem` - used.
- The `tools` - used.
- The `baseMessages` - used.
- The `activeMessages` - used.
- The `beginTranscriptTurn()` - used.
- The `writeTranscriptText` with chalk - used.
- The `accText`, `totalTokens`, `promptTokens`, `outputTokens` - all used.
- The for loop - used.
- The `streamText` call - used.
- The `result` type assertion - used.
- The `stepText` accumulation - used.
- The `usage` - used.
- The `onStepUsage` callback - used.
- The `parseToolCalls` - used.
- The `if (calls.length === 0)` branch - this is the normal exit condition when model stops calling tools. Live.
- The `textBefore` - used.
- The `executeToolCalls` - used.
- The `endTranscriptStep` - used.
- The `activeMessages` update - used.
- The return object - used.

Everything seems to be used. Let me check for any stale comments:

The comment at line 150-154:
```
// streamText below is called with no `tools`, so a native `role: 'tool'`
// message left in the history by an earlier turn on a native model would be a
// request referencing tools it never declared — a 400 on OpenAI and several
// compat providers. Reachable via `/model` mid-session, so flatten it to the
// same text protocol this loop speaks.
```
This explains why `flattenToolMessagesToText` is called. This seems accurate and not stale.

The comment at line 110-118 for `executeToolCalls`:
```
/**
 * Execute a batch of text-protocol tool calls through the wrapped tools and
 * return the `<tool_result>` blocks to feed back to the model. Shared by the
 * parsed-tools loop and the fake-LLM loop in loop.ts. Rethrows user aborts;
 * other tool errors become error results for the model.
 */
```
This mentions "fake-LLM loop in loop.ts" but the reference shows it's imported from `src/agent/fake-loop.ts`. The comment says "loop.ts" but the file is "fake-loop.ts". This might be a stale comment - it says "loop.ts" but the actual file is "fake-loop.ts". Let me check: the reference table shows `src/agent/fake-loop.ts:5: import { executeToolCalls } from './parsed-tools.js';`. So the comment says "loop.ts" but it's actually "fake-loop.ts". This could be a [stale] finding.

Wait, the comment says "fake-LLM loop in loop.ts" - maybe there's a file called `loop.ts` that also uses it? But the reference table only shows `fake-loop.ts`. Let me re-read: "Shared by the parsed-tools loop and the fake-LLM loop in loop.ts." But the only reference is from `fake-loop.ts`. If there's no `loop.ts` that uses it, this comment is stale.

However, I need to be careful - the reference table might not show all uses if there are dynamic imports or other mechanisms. But the reference table says "2 code references outside this file" for `executeToolCalls` and lists only `fake-loop.ts`. So likely the comment is stale.

But wait - the instruction says: "A hit in `docs/` is documentation OF the symbol, not a use of it. A symbol whose only hits are in `docs/` is unused." And "Anything you would have to read another file to be sure about. If the evidence in front of you does not settle it, say nothing."

I only have the reference table for this file. I don't have the full repo. The reference table shows only `fake-loop.ts` uses `executeToolCalls`. The comment says "loop.ts". This could be a stale comment. But I'd have to read another file to be sure. The instruction says not to report anything I'd have to read another file to be sure about.

Actually, the reference table is my only evidence. It shows 2 code references in `fake-loop.ts` (line 5 import and line 97 use). It doesn't show any `loop.ts`. So based on the evidence, the comment referencing "loop.ts" appears stale. But is this a "stale" finding about a comment? The tag [stale] is for "a comment, JSDoc or name asserting behaviour, a flag, a file or a symbol that the code no longer has."

This JSDoc comment asserts that the function is "Shared by the parsed-tools loop and the fake-LLM loop in loop.ts." But the evidence shows it's only shared with `fake-loop.ts`, not `loop.ts`. So this is a stale comment.

However, I need to be careful - maybe there's a `loop.ts` that dynamically imports or uses it in a way the reference table doesn't catch. The reference table says "It over-reports. A listed line may match an unrelated symbol that happens to share the name." But it also says "A symbol can be reached WITHOUT its name appearing anywhere: string-keyed dispatch, a registry populated at import time, a dynamic import, an index signature, a name built by concatenation."

So the reference table might UNDER-report too. But the instruction says: "If the evidence in front of you does not settle it, say nothing."

The evidence in front of me: reference table shows only `fake-loop.ts` uses `executeToolCalls`. The comment says "loop.ts". This suggests the comment is stale. But I can't be 100% sure without checking if `loop.ts` exists and uses it.

Let me look at the file again for any other issues.

Actually, wait - the `ParsedToolCall` interface is exported but not listed in the reference table at all. The reference table lists:
- buildParsedToolsSystemPrompt
- parseToolCalls
- ParsedToolsResult
- executeToolCalls
- runParsedToolsLoop

But `ParsedToolCall` is also exported (line 58: `export interface ParsedToolCall`). It's not in the reference table, meaning 0 references outside. But it's used in the return type of `parseToolCalls` which is exported. As per instructions, this is expected for types in exported function signatures.

But wait - `parseToolCalls` returns `ParsedToolCall[]`, and `parseToolCalls` is exported. So `ParsedToolCall` is part of the public API surface. Callers of `parseToolCalls` would need this type. But the reference table shows 0 references. However, the instructions explicitly say this is expected and correct: "A type or interface exported as part of an exported function's signature. Callers build those values without ever writing the type name, so zero references is expected and correct."

So `ParsedToolCall` is fine.

Now, what about `PARSED_TOOLS_ADDENDUM`? It's a const, not exported. Used in `buildParsedToolsSystemPrompt`. Live.

Let me check for any dead code branches:

In `parseToolCalls`, the `catch` block logs an error but continues. This handles malformed JSON. Live.

In `executeToolCalls`, the `if (!toolFn?.execute)` branch handles unknown tools. Live.

In `runParsedToolsLoop`, the `if (calls.length === 0)` branch handles final response. Live.

The `textBefore` logic - if there's text before first tool call, it's rendered. Live.

The `stepText.trim()` check before adding to messages - live.

Everything seems live.

The only potential finding is the stale comment in the JSDoc for `executeToolCalls` mentioning "loop.ts" when only "fake-loop.ts" references it. But I'm not 100% sure without checking the repo.

Actually, let me re-read the comment: "Shared by the parsed-tools loop and the fake-LLM loop in loop.ts."

The file is `src/agent/parsed-tools.ts`. The "parsed-tools loop" is this file. The "fake-LLM loop in loop.ts" - but the reference shows `fake-loop.ts`. Could "loop.ts" be a different file? Or is it a typo for "fake-loop.ts"?

Given the reference table only shows `fake-loop.ts`, and the comment says "loop.ts", this is likely a stale comment. But the instruction says "Anything you would have to read another file to be sure about. If the evidence in front of you does not settle it, say nothing."

The evidence in front of me is the reference table showing only `fake-loop.ts` uses `executeToolCalls`. The comment says "loop.ts". This is a discrepancy. But to be sure, I'd need to check if `src/agent/loop.ts` exists and uses it. I don't have that info.

However, the reference table is described as "Identifier matches across src/, tests/, scripts/ and docs." So if `loop.ts` existed and used `executeToolCalls`, it should show up. The fact that it doesn't show up suggests either:
1. `loop.ts` doesn't exist
2. `loop.ts` doesn't use `executeToolCalls`
3. The reference table missed it (but it's supposed to be a textual identifier match)

Given the reference table is my only evidence, and it doesn't show `loop.ts`, the comment appears stale. But the instruction is clear: "If the evidence in front of you does not settle it, say nothing."

Actually, the evidence DOES settle it: the reference table shows 2 code references in `fake-loop.ts` and none in `loop.ts`. The comment claims it's used in `loop.ts`. That's a direct contradiction. The evidence settles that the comment is inaccurate.

But wait - the reference table says "It over-reports. A listed line may match an unrelated symbol that happens to share the name." It doesn't say it under-reports. But it also says "A symbol can be reached WITHOUT its name appearing anywhere: string-keyed dispatch, a registry populated at import time, a dynamic import, an index signature, a name built by concatenation."

So it CAN under-report for dynamic imports. But `executeToolCalls` is a named export, so a dynamic import would still need to reference the name somehow.

I think the safe answer is OK - no findings. The comment discrepancy is minor and I can't be 100% sure. The instructions are strict about not reporting anything uncertain.

Let me also check: is there any exported symbol that should be unexported? The reference table shows all exported functions have external references except `ParsedToolsResult` which is a type in an exported function signature (expected). `ParsedToolCall` is also a type in an exported function signature (expected).

What about `buildParsedToolsSystemPrompt`? It's used in tests. But is it used in production code? The reference table shows only test references. But tests count as uses: "A hit in `tests/` IS a use. Tested code is live code." So it's live.

Similarly `parseToolCalls` and `runParsedToolsLoop` have test references.

`executeToolCalls` has production reference in `fake-loop.ts`.

So all exports are used.

I think the answer is OK.OK

## src/agent/tools/index.ts

- [stale] comment in `wrap` function (lines 307–309) — the comment claims `spawn_agent` "skips confirmation (like the read-only tools)", but `READ_ONLY_TOOL_DEFS` are wrapped via `wrapAll` which defaults `requiresConfirmation=true`, so read-only tools go through `withConfirmation`; only `spawn_agent` passes `requiresConfirmation=false` and truly skips confirmation

## src/agent/turn-messages.ts — ERROR

[object Object]

## src/cli/chrome/toggles.ts

- [stale] hintRest — comment claims "e.g. 'sk' for Ask" but no toggle has a label starting with 'A' followed by 'sk'; the auto-run toggle's first state label is 'auto-run tools'

## src/cli/command-dispatcher.ts

- [unexport] CommandDispatchResult — exported but never imported by any other code; only used internally as the return type of dispatchCommand (0 code references outside this file per reference table)

## src/cli/menus/action-menu.ts — ERROR

[object Object]

## src/cli/menus/menu-shell.ts

- [unexport] MenuShellOptions — exported but only used internally in runMenuShell's signature; 0 code references outside this file (only docs mention it)

## src/cli/render/transcript-renderer.ts

- [unexport] renderToolStep — exported but has 0 code references outside this file; only used internally at line 394 (in renderTurn). Documentation mentions it but docs hits are not uses.
- [stale] endTranscriptStep JSDoc (lines 200–204) — claims "hasMore=false: final step — writes only the closing divider" but the code defers the divider (_pendingDivider = true) and may never write it (inline comment on line 212 confirms: "If no next turn starts, it is never written").

## src/cli/tools/tool-invocation.ts

- [unexport] ToolParam — interface exported but only used internally to type TOOL_PARAMS; zero external code references (only documentation mentions it)
- [unexport] toolCallSlots — function exported but only called internally by nextToolFieldCaret and toolFieldBackspace; zero external code references (only documentation mentions it)

## src/eval/runner.ts

- [unexport] EvalToolCall — exported interface with 0 code references outside this file; used internally at lines 19, 149, 151 only
- [unexport] EvalTokenUsage — exported interface with 0 code references outside this file; used internally at line 19 only

## src/providers/adapters/openai-compat-quirks.ts

- [unexport] OpenAICompatQuirks — interface exported but never imported outside this file; only used locally to type `providerQuirks` (reference table shows 0 code references outside, only documentation mentions)

## src/providers/fake.ts

- [unexport] FAKE_DEFAULT_MODEL_ID — exported const used only internally (line 112 in createPlaceholderFakeLanguageModel); zero external code references in reference table

## src/providers/model-data.ts

- [unexport] ObservedRateLimits — exported but zero external code references; only used internally as the type of ModelEntry.rateLimits

## src/providers/pricing-verifier.ts

- [unexport] VerifiedRates — exported interface with 0 external code references; only used internally as return type for getVerifiedRates, getAnthropicVerifiedRates, getOpenAIVerifiedRates
- [unexport] LITELLM_PRICING_URL — exported const with 0 external code references; only used internally in fetchLiteLLM
- [unexport] OPENROUTER_MODELS_URL — exported const with 0 external code references; only used internally in fetchOpenRouter
- [unexport] getLiteLLMRates — exported function with 0 external code references; only used internally by getVerifiedRates
- [unexport] getOpenRouterRates — exported function with 0 external code references; only used internally by getVerifiedRates
- [unexport] getVerifiedRates — exported function with 0 external code references; only used internally by getAnthropicVerifiedRates and getOpenAIVerifiedRates

## src/providers/types.ts

- [unexport] RateLimits — used only internally as the type of `ModelConfig.limits`; zero external code references (reference table shows 0 outside this file), so the `export` keyword can be removed while keeping the interface.

## src/util/errors.ts

- [unexport] isNoSuchToolError — exported but only used internally by rejectedToolCall (line 226); 0 external code references
- [unexport] noSuchToolName — exported but only used internally by rejectedToolCall (line 227); 0 external code references
- [unexport] noSuchToolAvailableList — exported but only used internally by rejectedToolCall (line 228); 0 external code references
- [unexport] isInvalidToolArgumentsError — exported but only used internally by rejectedToolCall (line 238); 0 external code references
- [unexport] invalidToolName — exported but only used internally by rejectedToolCall (line 239); 0 external code references

## src/util/line-diff.ts — ERROR

[object Object]

## HTTP diagnostics

- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 3 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/0
- backoff waits: 0, 0.0s summed across workers (not wall time)
- successful call latency: median 1.1s · max 10.2s
- rate-limit headers on 429s: 0/0 carried them — req remaining absent of limit absent, tokens remaining absent of limit absent

### Terminal failures

```
   52.3s start     1.0s spent   1 requests  src/agent/turn-messages.ts
  141.1s start     1.7s spent   1 requests  src/cli/menus/action-menu.ts
  485.5s start     0.6s spent   1 requests  src/util/line-diff.ts
```

Requests per file: min 1 · median 1 · max 1.
A file that never hits a limit sends 1; anything above that is retry traffic.

