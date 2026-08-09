# src/providers/fake.ts - Fake LLM Fixtures

**Role:** Test-only fake model runner for free agent-loop verification. It validates ordered JSON fixture steps, emits deterministic text/chunk responses and scripted tool calls, and records fake-model traces for e2e assertions when requested.

**Why it lives in `src/` and ships in `dist/`:** `mock` and `mock-native` are real entries in
`provider-registry.ts`, resolved at runtime from a model string like `mock:gpt-freecode-test`.
E2e tests spawn the built binary (`tests/harness/run-e2e.ts` runs `dist/index.js`), so the
fake must be present in the build or e2e tests lose their model. It is a deliberately fake
provider, not a test fixture - do not move it to `tests/`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
FAKE_PROVIDER_ID: 'mock'

FAKE_NATIVE_PROVIDER_ID: 'mock-native'

FAKE_DEFAULT_MODEL_ID: 'gpt-freecode-test'

FAKE_MODEL_PREFIX: 'mock:'

FAKE_NATIVE_MODEL_PREFIX: 'mock-native:'

interface FakeUsage {
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
}

interface FakeModelCall {
  providerId: string;
  modelId: string;
  systemPrompt: string;
  messages: CoreMessage[];
  toolNames: string[];
  toolRationale: boolean;
  parallelTools: boolean;
  nativeToolsSupplied: boolean;
}

interface FakeModelResult {
  text: string;
  /**
   * The text exactly as it was written to the screen — the chunks joined, plus
   * the terminating newline this module adds. `text` is the model's own output
   * and may lack that newline, so a caller that reports what was painted (the
   * transcript step state machine) must use this instead: told the text ends
   * without a newline, the renderer emits a second blank line before the next
   * tool call that is not on screen.
   */
  writtenText: string;
  usage: FakeUsage;
  toolCalls: FakeToolCall[];
}

interface FakeToolCall {
  name: string;
  args: Record<string, unknown>;
}

isFakeLlmMode(): boolean

isFakeNativeModelPreference(modelPreference: string): boolean

createPlaceholderFakeLanguageModel(): LanguageModelV1

fakeModelSupportsTools(modelId: string): boolean

resetFakeModelState(): void

assertFakeFixtureComplete(): void

interface FakeNativeModelSettings {
  toolRationale: boolean;
  parallelTools: boolean;
}

createFakeNativeLanguageModel(modelId: string, modelSettings: FakeNativeModelSettings): LanguageModelV1

runFakeModel(call: FakeModelCall): Promise<FakeModelResult>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-record.ts`](../cli/render/transcript-record.md) ×2
- **Imported by:** [`providers/provider-registry.ts`](provider-registry.md) ×15, [`agent/loop.ts`](../agent/loop.md) ×5, [`agent/fake-loop.ts`](../agent/fake-loop.md) ×2, [`agent/subagents/run-subagent.ts`](../agent/subagents/run-subagent.md) ×1

## Tests

`tests/providers/fake.test.ts`. 4 other test files reference it.

## Budget

434 / 500 lines (66 to spare).

## Env

`FREECODE_FAKE_LLM`, `FREECODE_FAKE_LLM_SCRIPT`, `FREECODE_FAKE_LLM_TRACE`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `FakeModelResult.text` vs `.writtenText` — `text` is the model's own output (what goes into history and the trace); `writtenText` is what this module actually painted, i.e. the chunks plus the newline it appends to terminate the step. Anything reporting *what is on screen* must use `writtenText`: `fake-loop.ts` feeds it to `notifyTranscriptChunk`, and getting that wrong put a phantom blank line above every tool call (see `docs/bug log/29-07-2026b.md`).

## Read When

- Changing fake LLM fixture format or matching rules.
- Debugging `llmFixture` e2e failures.
- Extending fake coverage into parsed-tools or Responses-style paths.

## Execution Paths

Two fake execution paths share the same fixture format and trace mechanism:

- **fake-direct** (`mock:*`): `agentLoop()` calls `runFakeModel()` directly, bypassing `streamText()`. Covers the tool-call loop and transcript rendering without the AI SDK.
- **native-stream** (`mock-native:*`): `agentLoop()` uses a real `LanguageModelV1`-compatible `doStream` implementation built via `createFakeNativeLanguageModel()`. The full `streamText()` path, retry/fallback ladder, and usage capture run as in production.

## Common Rules (both paths)

- Fake mode is active only when `FREECODE_FAKE_LLM=1`.
- Fixture path comes from `FREECODE_FAKE_LLM_SCRIPT`.
- Trace output is optional through `FREECODE_FAKE_LLM_TRACE`; e2e tests can assert it with `expect.fakeLlmTrace`.
- Steps are consumed in order and fail closed on mismatched provider, model, turn, message count, system prompt, user text, required tool names, tool settings, malformed tool calls, exhausted fixtures, or unused fixture steps.
- Trace entries include `executionPath` (`'fake-direct'` or `'native-stream'`), emitted chunks, emitted tool calls, prompt-facing messages, tool availability, tool settings, and deterministic usage metadata.

## Key Neighbors

- [provider-registry.md](provider-registry.md): gates `mock:*` model resolution and blocks real providers in fake mode.
- [agent/loop.md](../agent/loop.md): calls `runFakeModel()` after building the real system prompt and tool list.

## Update Triggers

Update this page when fake fixture schema, matching behavior, trace behavior, or supported response types change.
