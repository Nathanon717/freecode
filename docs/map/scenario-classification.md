# src/scenario-classification.ts - Scenario Classifier

**Role:** Determines whether a scripted scenario can run without an LLM or must be treated as an eval.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `isScriptedConfirmation` | `(input: string) => boolean` | True for `y`, `yes`, `n`, or `no`. |
| `isNonLlmScriptInput` | `(input: string) => boolean` | True for blank input, confirmations, `/model`, `/model ...`, `/models`, `/models ...`, and known structural slash commands. |
| `classifyScenario` | `(scenario) => ScenarioClassification` | Computes declared/inferred LLM requirement and validation errors. |

## Non-LLM Commands

The classifier treats these as structural and safe for non-LLM verification:

```text
/help
/test
/eval
/keys
/resume
/clear
/config
/sources
/model-sources
/model
/model ...
/models
/models ...
```

Any non-empty turn input outside that set is considered an agent prompt, so `inferredRequiresLlm` becomes true.

## Validation

`classifyScenario()` reports errors when:

- `requiresLlm` is missing or not boolean.
- `requiresLlm: true` is declared but no turn reaches the agent loop.
- `requiresLlm: false` is declared but one or more turns do reach the agent loop.
- `llmFixture` is present but is empty, uses `requiresLlm: true`, omits an agent turn, or uses a non-`mock:*` model.

## Fake Fixtures

Scenarios with `llmFixture` are classified as free verification even though they enter the agent loop. The harness runs them with `FREECODE_FAKE_LLM=1` and a `mock:*` model, so they remain part of normal non-LLM verification rather than `/eval`.
