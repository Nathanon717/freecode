# Free-Only LLM Mocking Plan

**Goal / done state:** every real model execution path (AI SDK native `streamText()`, OpenAI Responses, prompt-tools fallback) has a free fake-LLM scenario, and the expensive provider-backed eval workflows are converted to fake `tests/scenarios/`. When `Still To Do` is empty, the plan is shippable and this file can be archived or deleted.

---

## Operating procedure — do this when told to read this file

You are running one session of work against this plan. Execute it autonomously, then stop. Do not ask which item to do; the order is fixed.

1. **Pick the top bullet in `Still To Do`.** That is your only target this session. Ignore the rest.
2. **If `Still To Do` is empty:** the plan is complete. Report that, suggest archiving/deleting this file, and stop. Do nothing else.
3. **Build it to its definition of done** — code, the fake transport/path it needs, a `tests/scenarios/` scenario, trace assertions, and unit tests. The bullet's own text and the `Maintenance` rules below define "done." A change touching `src/` is not done until `npm.cmd test` is green.
4. **If the top bullet is a grab-bag** (lists many sub-scenarios, e.g. failure-modes or the eval conversions): do as many sub-items as fit cleanly in one session with tests green, then **edit the bullet to delete only the finished sub-items**, leaving the rest. The bullet shrinks in place; it stays at the top until empty.
5. **When the bullet is fully done, delete it** from `Still To Do`. Add a line to `Done So Far` only if it records something a future session needs to know.
6. **Never grow the list.** Do not add, reword, or "extend/expand/broaden" bullets. If you discover a genuinely new, necessary prerequisite, you may add one concrete bullet with a clear done state — but state plainly in your final report that you did and why, so it can be vetoed. The list growing is a failure signal.
7. **Stop after one target.** Do not start a second bullet. End by reporting: what you finished, that tests pass, and what is now at the top of `Still To Do`.

---

**Invariants** (always-true quality bars, enforced in code — not work items, do not list them as tasks):

- `npm.cmd test` and scenario verification must never make paid or live LLM calls, even when provider keys exist in the environment. Fake mode fails closed.
- Fake LLM verification is labeled as free verification in `/test` and generated scenario docs; `/eval` is reserved for manually run live/provider-backed experiments.

Maintenance instructions:

- This is a finite plan, not a standing backlog. `Still To Do` holds concrete, session-sized chunks of remaining work toward the Goal above. The list should shrink over time.
- Finish a chunk → delete it from `Still To Do` (add a line to `Done So Far` only when the record is useful).
- Each chunk owns its definition of done: when you add an execution path, its fake transport, trace data, fixture matching, assertions, and unit tests ship together. Those are not separate bullets.
- Do **not** add "keep / maintain / extend / expand / broaden the above" bullets — that is how this list stopped shrinking. Only add a bullet if it is genuinely new, necessary, concrete, and has a clear done state.

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
- `tests/scenarios/agent-create-fake.scenario.json` covers a deterministic fake model tool call through the real `create` wrapper, approval flow, tool trace, file assertion, and two-call fake model trace.
- Unit tests cover fake fixture classification, fake runner validation, trace writing, unused-step detection, mock-model gating, real-provider blocking in fake mode, and live-discovery blocking in fake mode.
- `docs/testing-scenarios.md`, generated scenario docs, and relevant map pages document fake fixture authoring, fake trace assertions, and the current strict safety rules.
- `npm.cmd test` includes fake-LLM scenarios in normal free verification and passes with the implemented fake coverage.
- `mock-native:*` model prefix routes through the real AI SDK `streamText()` path using a spec-compliant `LanguageModelV1`-compatible `doStream` implementation (`createFakeNativeLanguageModel()`). The `executionPath` is `'native-stream'` in traces; the fake-direct path is unchanged for existing `mock:*` scenarios. The registry blocks `mock-native:*` outside `FREECODE_FAKE_LLM=1` mode. `agent-text-native.scenario.json` verifies a deterministic text response through the real `streamText()` loop.
- Scenario classification extended to allow `mock-native:*` as a valid fake model prefix in `llmFixture` scenarios.
- `agent-tool-native.scenario.json` covers a multi-step native-stream tool call: `doStream` emits a `create` tool-call part with `finishReason: 'tool-calls'`, the real AI SDK `streamText()` executes the tool (requires `rationale` in args when `toolRationale: true`), calls `doStream` again, and emits final text. Two-call fake trace with `executionPath: 'native-stream'` on both. Unit test drives the same path directly via a plain zod tool without the confirmation wrapper.

## Still To Do

- **OpenAI Responses path.** Add a fake Responses transport returning realistic Responses-style JSON (`output_text`, `output`, `function_call`, `function_call_output`, usage), routed by a fake model and gated to fake mode. Ships with a scenario, a `responses` `executionPath` trace, fixture matching for Responses-supplied/omitted tools, and unit tests.
- **Prompt-tools fallback path.** Add a scripted prompt-tools fake mode that emits `<tool_call>...</tool_call>` blocks, supports tool-call JSON split across chunks, reinjects `<tool_result>` messages, and produces a final text response. Ships with a scenario, a prompt-tools `executionPath` trace, fixture matching for prompt-tool-supplied/omitted tools, and unit tests.
- **Errors, usage metadata, and streaming behavior.** Add fake responses for controlled errors, no-text responses, usage-after-stream, usage failure, and malformed/missing usage; plus deterministic streaming (incremental chunks, partial text then error, TTY rendering while text streams). Ships with assertions and unit tests.
- **Failure-mode scenarios.** Add free failure-mode scenarios: bad model selection, unknown provider, missing keys for real providers, context overflow, no-tool and native-tool-rejection behavior, malformed tool calls, unknown tools, invalid tool arguments, repeated tool loops, stream abort, and stream failure after partial output.
- **Convert eval workflows to fake scenarios** (the payoff). Duplicate the expensive provider-backed eval workflows into fake `tests/scenarios/`: simple text, approved tool call, denied tool call, multi-tool file creation, read-edit-write, grep workflow, shell approval, malformed tool retry, unknown tool retry, prompt-tools fallback, context overflow, partial stream error, session resume, and TTY streaming.

## Out-of-scope candidates (decide keep/cut before adding back)

These were on the old list but are developer-convenience polish, not required to reach the Goal. Listed here so they are not silently lost — promote into `Still To Do` only if actually wanted.

- Fixture authoring utilities: a JSON schema or TypeScript fixture validator, normalized message matching, better unmatched-call diagnostics, optional fixture names, and explicit unused-step controls.
