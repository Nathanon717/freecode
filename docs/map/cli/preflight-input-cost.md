# src/cli/preflight-input-cost.ts - OpenAI Input Cost Preflight

**Role:** Debounced controller for the interactive input box's exact OpenAI input-token and input-cost preview.

## Exports

- `createOpenAIPreflightInputController(options)` - schedules, cancels, caches, and applies preflight input-cost snapshots while the user types.
- `resetOpenAIPreflightCache()` - clears the in-memory payload-hash cache for tests.

## Read When

- Changing live input-cost behavior, debounce timing, cache invalidation, or provider/model gating.
- Debugging why the bottom status line does or does not show OpenAI pre-send input cost.

## Behavior

- Only runs for selected models shaped as `openai:<model>`.
- Skips empty input, slash commands, and non-OpenAI providers silently; reports missing OpenAI API keys for selected OpenAI models.
- Builds the same Responses payload shape used by direct OpenAI generation, hashes it, and reuses cached counts for repeated payloads.
- Aborts or ignores stale count requests when the input changes.

## Key Neighbors

- [input-modes.md](input-modes.md): owns interactive key handling and creates the controller.
- [terminal-ui.md](terminal-ui.md): renders `PreflightInputCost` snapshots.
- [../providers/adapters/openai-responses.md](../providers/adapters/openai-responses.md): builds/counts OpenAI Responses payloads.
- [../providers/openai-cost.md](../providers/openai-cost.md): computes input-token cost from verified rates.

## Update Triggers

Update this page when preflight eligibility, payload construction, cache behavior, or status snapshot fields change.
