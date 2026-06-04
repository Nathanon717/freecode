# Free-Only LLM Mocking Plan

Maintenance instructions:

- Keep this file as two status sections only: `Done So Far` and `Still To Do`.
- When work is completed, move or rewrite the relevant item from `Still To Do` into `Done So Far`.
- When partial work changes the remaining scope, update both sections in the same change so this file never describes completed work as pending.
- Keep bullets concrete and testable. Mention the implementation surface and the verification coverage when relevant.
- Do not add long rationale sections here. Put durable design detail in `docs/` or an ADR if it needs to live beyond status tracking.

## Done So Far

- `FREECODE_FAKE_LLM=1` is a first-class fake-mode guard.
- `mock:gpt-freecode-test` resolves only in fake mode and is virtual, so it does not appear in the normal provider registry, `/keys`, or `/model` provider lists.
- The CLI parses `--model <provider:model>`, so scenario-provided mock models seed the selected model for scripted runs.
- Fake mode fails closed if code tries to resolve a real provider or initialize live model discovery.
- Scenario JSON supports `llmFixture`, classified as free verification when paired with `requiresLlm: false` and a `mock:*` model.
- The scenario harness strips provider keys, sets `FREECODE_FAKE_LLM=1`, passes `FREECODE_FAKE_LLM_SCRIPT`, leaves `FREECODE_NO_LLM` unset, and runs the real CLI script path for fake-fixture scenarios.
- The fixture-driven fake runner validates ordered text, chunk, and tool-call steps against provider, model, turn number, system prompt presence, last user message contents, and available tool names.
- The fake runner returns deterministic usage metadata, validates unused steps, and can write a fake-model trace through `FREECODE_FAKE_LLM_TRACE`.
- Scenario expectations support `fakeLlmTrace` assertions for fake model call count, provider/model/execution path, last user text, available/absent tools, emitted text, emitted tool calls, and usage metadata.
- Fake fixture `toolCalls` drive the real agent-loop tool wrappers, including scripted approval, transcript rendering, and `FREECODE_TRACE_JSON` assertions.
- Fixture matching and fake traces now validate conversation history length, tool-rationale setting, parallel-tool setting, and whether native tools were supplied in the existing fake-direct path.
- `tests/scenarios/agent-text-fake.scenario.json` covers the real agent loop with a deterministic fake text response and fake model trace assertions during normal scenario verification.
- `tests/scenarios/agent-write-file-fake.scenario.json` covers a deterministic fake model tool call through the real `write_file` wrapper, approval flow, tool trace, file assertion, and two-call fake model trace.
- Unit tests cover fake fixture classification, fake runner validation, trace writing, unused-step detection, mock-model gating, real-provider blocking in fake mode, and live-discovery blocking in fake mode.
- `docs/testing-scenarios.md`, generated scenario docs, and relevant map pages document fake fixture authoring, fake trace assertions, and the current strict safety rules.
- `npm.cmd test` includes fake-LLM scenarios in normal free verification and passes with the implemented fake coverage.

## Still To Do

- Keep strengthening the hard invariant that `npm.cmd test` and scenario verification cannot make paid or live LLM calls, even when provider keys exist in the developer environment.
- Add configurable fake model traits beyond the current route, including no-tool behavior, native-tool rejection behavior, context-window metadata, deterministic quota metadata, and model/status display metadata where needed.
- Extend fixture matching for future fake execution paths to validate whether prompt-tools fallback and Responses-style transports supplied or intentionally omitted their path-specific tools.
- Extend fake responses with provider usage metadata, controlled errors, no-text responses, usage-after-stream behavior, usage errors, and malformed/missing usage cases.
- Add fake coverage for all three model execution paths: OpenAI Responses, AI SDK native `streamText()`, and prompt-based tool fallback.
- Add a fake OpenAI Responses transport that returns realistic Responses-style JSON, including `output_text`, `output`, `function_call`, `function_call_output`, and usage.
- Add a fake `LanguageModel` compatible with `streamText()` so normal native-tool streaming orchestration is exercised without a live provider.
- Add scripted prompt-tools mode that emits `<tool_call>...</tool_call>` blocks, supports split JSON across chunks, reinjects `<tool_result>` messages, and produces a final text response.
- Expand fake trace data and assertions for native-tool supply mode, prompt-tools fallback, retry behavior, provider usage metadata, scripted errors, and multi-path execution.
- Cover deterministic streaming behavior: incremental chunks, partial text then error, usage after stream consumption, usage failure, prompt-tool JSON split across chunks, and TTY rendering while text streams.
- Add free provider/model failure-mode scenarios for bad model selection, unknown provider, missing keys for real providers, context overflow, native-tool rejection, malformed tool calls, unknown tools, invalid tool arguments, repeated tool loops, stream abort, and stream failure after partial output.
- Add fixture authoring utilities such as a JSON schema or TypeScript validator, normalized message matching, better unmatched-call diagnostics, optional fixture names, and explicit unused-step controls.
- Broaden fake infrastructure unit tests for all remaining fixture features, especially scripted errors, streaming order, prompt-tools behavior, Responses behavior, and provider usage metadata.
- Convert or duplicate expensive provider-backed eval workflows into fake `tests/scenarios/` coverage, prioritizing simple text, approved tool call, denied tool call, multi-tool file creation, read-edit-write, grep workflow, shell approval, malformed tool retry, unknown tool retry, prompt-tools fallback, context overflow, partial stream error, session resume, and TTY streaming.
- Keep `/test` and generated scenario docs clearly labeling fake LLM verification as free verification, with `/eval` reserved for manually run live/provider-backed experiments.
