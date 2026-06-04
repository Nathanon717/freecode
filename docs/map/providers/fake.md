# src/providers/fake.ts - Fake LLM Fixtures

**Role:** Test-only fake model runner for free agent-loop verification. It validates ordered JSON fixture steps, emits deterministic text/chunk responses and scripted tool calls, and records fake-model traces for scenario assertions when requested.

## Exports

```typescript
FAKE_PROVIDER_ID
FAKE_DEFAULT_MODEL_ID
FAKE_MODEL_PREFIX
isFakeLlmMode()
isFakeModelPreference(modelPreference)
createPlaceholderFakeLanguageModel()
fakeModelSupportsTools(modelId)
resetFakeModelState()
assertFakeFixtureComplete()
runFakeModel(call)
```

## Read When

- Changing fake LLM fixture format or matching rules.
- Debugging `llmFixture` scenario failures.
- Extending fake coverage from text/chunk responses into native tool calls, prompt-tools, or Responses-style paths.

## Execution Rules

- Fake mode is active only when `FREECODE_FAKE_LLM=1`.
- Fixture path comes from `FREECODE_FAKE_LLM_SCRIPT`.
- Trace output is optional through `FREECODE_FAKE_LLM_TRACE`; scenarios can assert it with `expect.fakeLlmTrace`.
- Steps are consumed in order and fail closed on mismatched provider, model, turn, message count, system prompt, user text, required tool names, tool settings, malformed tool calls, exhausted fixtures, or unused fixture steps.
- `response.toolCalls` can script one or more tool calls. `agentLoop()` executes them through `createTools()`, so confirmations, transcript rendering, and `FREECODE_TRACE_JSON` assertions use the normal tool wrappers.
- Trace entries include `executionPath`, emitted chunks, emitted tool calls, prompt-facing messages, tool availability, tool settings, and deterministic usage metadata.

## Key Neighbors

- [registry.md](registry.md): gates `mock:*` model resolution and blocks real providers in fake mode.
- [agent/loop.md](../agent/loop.md): calls `runFakeModel()` after building the real system prompt and tool list.
- [scenario-classification.md](../scenario-classification.md): validates `llmFixture` scenarios as free verification.
- [cli/scenario-catalog.md](../cli/scenario-catalog.md): scenario harness env wiring for fake fixtures.

## Update Triggers

Update this page when fake fixture schema, matching behavior, trace behavior, or supported response types change.
