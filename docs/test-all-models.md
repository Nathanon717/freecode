# Model Availability Smoke Test

`scripts/test-all-models.ts` sends the single message `"hi"` to every free model in the registry, one HTTP call each, and records which ones responded successfully.

## Usage

```
npx tsx scripts/test-all-models.ts
```

Requires the same API keys the app itself uses (env vars, Doppler, or `~/.config/freecode/config.json`) — it calls `tryInjectDoppler()` on startup exactly like `src/index.ts` does, so a plain `npx tsx` invocation picks up Doppler secrets automatically when the `doppler` CLI is linked.

## Model list

The set of models tested comes from `getSelectableModels()` ([src/commands/model.ts](map/commands/model.md)) — the same function the in-app `/model` picker and the startup prefetch call. This script does not reimplement or hand-copy that filtering; it imports and calls the real function, so the list is always exactly what the picker would show.

On top of that list, the script drops any provider flagged `paid: true` in `PROVIDER_REGISTRY` ([src/providers/registry-data.ts](map/providers/registry.md)) — currently `openai` and `anthropic` — so it only spends against free-tier providers. This is an explicit additional filter layered on top of `getSelectableModels()`'s output, not a change to the picker's own logic.

## Per-model call

For each model:

- `resolveModel(providerId:modelId)` is called fresh, producing a brand-new `LanguageModel` client with no shared state across models.
- `streamText()` is called directly with `messages: [{ role: 'user', content: 'hi' }]` — no system prompt, no tools, no prior history. This bypasses `agentLoop()` entirely, since the agent loop attaches a system prompt and tool definitions that the plain "hi" smoke test doesn't want.
- The stream is fully drained (`for await` over `textStream`, then `await result.text`) inside the `try/catch`. In `ai@3.x`, provider errors surface when the stream is consumed, not when `streamText()` is called — skipping the drain would silently mark failing models as successful.
- `maxRetries: 0` disables the AI SDK's own retry layer, and an `AbortSignal.timeout(90_000)` bounds how long a single hung call can block the run.
- Each model gets exactly one logical attempt from this script — there is no loop-level retry on failure.

**Caveat:** the OpenAI-compatible adapter (`src/providers/adapters/openai-compat.ts`, used by most free providers) has its own hardcoded HTTP retry on 429/503 responses (up to 5 attempts, exponential backoff capped by `retryMaxWaitSeconds` in config, default 120s) with no public switch to disable it. That retry is part of every real call the app ever makes, not something this script adds — so on a rate-limited key, a single "attempt" here may still involve more than one HTTP request under the hood, and the per-model timer can stall during backoff.

## Progress display

While a model is in flight, a TTY prints `[n/N] provider:model — <elapsed>s`, updating once a second. Non-TTY output (e.g. redirected to a file, or a `pty`/CI run) prints a start line and a result line per model instead of rewriting in place.

## Output

Results are written once, at the end of the run, to `scripts/model-availability-results.txt`:

```
<succeeded>/<total> models succeeded

provider:model    works             <duration>
provider:model    HTTP 404: ...     <duration>
```

The file is fully overwritten by a single `writeFileSync` call after the loop completes — it is not wiped at the start and not appended incrementally. Consequences:

- Canceling mid-run writes nothing; whatever file existed before the run is left untouched (stale, from a prior run, or absent).
- A completed run fully replaces the file's contents — reruns never produce duplicate entries.
