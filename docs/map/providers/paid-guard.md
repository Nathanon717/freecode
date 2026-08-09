# src/providers/paid-guard.ts - Free-Only Hard Block

**Role:** The one switch that makes freecode safe to hand to an LLM: `FREECODE_FREE_ONLY=1` blocks every paid model call. Declares the flag, the billable env vars, and the refusal message.

**Read when:** working on anything that resolves a model, loads an API key, or spawns a freecode child process that an agent drives.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
FREE_ONLY_ENV_VAR: 'FREECODE_FREE_ONLY'

/**
 * Env vars holding credentials that can be billed. Kept as literals rather than
 * derived from PROVIDER_REGISTRY because src/index.ts reads this before the
 * catalog loads; a unit test pins it against every `paid: true` provider.
 *
 * OPENAI_ADMIN_KEY is not a provider key — providers/openai-daily-spend.ts uses it
 * for the read-only billing endpoint, so it cannot spend. It is filtered anyway so
 * that "no paid credentials in this process" is literally true.
 */
PAID_API_KEY_ENV_VARS: readonly ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_ADMIN_KEY']

isPaidApiKeyEnvVar(name: string): boolean

isFreeOnlyMode(env?: ProcessEnv): boolean

/**
 * Message for a refused model. Deliberately names the flag: the agent reading it
 * should understand it needs a different model, not that freecode is broken.
 */
freeOnlyRefusal(modelPreference: string, why: string): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`index.ts`](../index.md) ×3, [`providers/provider-registry.ts`](provider-registry.md) ×3, [`config/index.ts`](../config/index.md) ×1

## Tests

`tests/providers/paid-guard.test.ts`.

## Budget

59 / 500 lines (441 to spare).
<!-- END GENERATED MAP FACTS -->

## Three layers

Each is independently sufficient for the case it covers; none is redundant.

1. **`src/index.ts`** skips `PAID_API_KEY_ENV_VARS` when injecting Doppler secrets,
   so the credentials never enter the process. This layer exists because
   `tryInjectDoppler` runs at boot and *re-downloads* keys a parent process
   deliberately stripped — the reason the e2e harness needs `DOPPLER_PROJECT: '1'`
   as well as its `safeBaseEnv`.
2. **`config/index.ts` `resolveApiKey`** reports no key for a `paid` provider, which
   hides it from the picker and stops model discovery fetching it. This is the layer
   that catches a key exported in the user's own shell.
3. **`providers/provider-registry.ts` `resolveModel`** refuses to build the model
   handle — for a `paid` provider, or for a model id its provider's `isFreeModelId`
   rejects. This is the layer that matters, because it is the funnel every call path
   reaches, **including the three that never consult the picker's filtered list**:
   `--model`, `FREECODE_MODEL`, and a persisted `defaultModel`. Filtering model
   *discovery* never covered those — a `:free`-only picker list did not stop
   `--model openrouter:anthropic/claude-opus-4.5` from resolving and billing.

## Who turns it on

- `freecode -p` — always. `src/index.ts` translates the flag to the env var before
  `tryInjectDoppler()` runs, since the guard reads env only.
- `tests/harness/pty/session.ts` — the documented way for an agent to drive the real
  TUI, where the model picker would otherwise list paid providers.

## Notes

- `PAID_API_KEY_ENV_VARS` is literals, not derived from `PROVIDER_REGISTRY`, because
  `src/index.ts` reads it before the catalog loads. `tests/providers/paid-guard.test.ts`
  pins it against every `paid: true` provider so the two cannot drift.
- `OPENAI_ADMIN_KEY` is not a provider key — `providers/openai-daily-spend.ts` uses it
  for the read-only billing endpoint and it cannot spend. Filtered anyway so "no paid
  credentials in this process" is literally true.
- **Threat model:** this stops an agent spending money by accident. It is not a
  sandbox against one that means to — anything that can edit source can unset an env
  var.

## Update triggers

- A provider gains or loses `paid: true` (update the env var list and the test).
- A new entry point hands freecode to an agent (turn the flag on there).
- The free-model predicate moves (it lives on the catalog entry — see
  [provider-catalog.md](provider-catalog.md)).
