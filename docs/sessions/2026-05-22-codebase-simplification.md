# Codebase Simplification Pass

**Date:** 2026-05-22

## What was built

A targeted cleanup pass removing redundancies, duplicated patterns, and scattered boilerplate identified in a full-codebase audit.

## Changes

### New shared utilities (`src/util/`)

- **`src/util/guards.ts`** — `isRecord()` was defined identically in `openai-compat.ts` and `openai-responses.ts`. Extracted once; both files now import it.
- **`src/util/errors.ts`** — `error instanceof Error ? error.message : String(error)` appeared in six places with slight variations. Extracted as `toErrorMessage(error)`. Updated: `loop.ts`, `tools/index.ts`, `command-dispatcher.ts`, `preflight-input-cost.ts`, `anthropic-cost.ts`, `openai-cost.ts`, `openai-responses.ts`.

### Config utilities (`src/config/index.ts`)

- **`getConfigDir()`** — the `process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode')` expression was duplicated in `config/index.ts` (×2) and `model-cache.ts`. Extracted once; all three call sites updated.
- **`resolveApiKey(provider)`** — the pattern `process.env[provider.apiKeyEnvVar] || config.providers[provider.id]?.apiKey` appeared in 7 places across `registry.ts`, both adapters, `commands/model.ts`, and `command-dispatcher.ts`. Extracted as a single utility. Callers no longer need to call `loadConfig()` just for the key check.

### Session cost tracker factory (`src/providers/anthropic-cost.ts`)

- The three session cost functions (`reset`, `add`, `get`) were implemented identically in `anthropic-cost.ts` and `openai-cost.ts` using module-level state. Extracted as `createSessionCostTracker()`. Both files now use it; the public API (`resetAnthropicSessionCost`, etc.) is unchanged.

### OpenAI cost breakdown helper (`src/providers/openai-cost.ts`)

- `estimateOpenAICost` and `estimateOpenAICostVerified` both constructed a 15-field `CostEstimateBreakdown` with identical zero values for all cache fields. Extracted as `openAICostBreakdown(...)`.

### `formatArgs` deduplication

- `formatArgs` in `tools/index.ts` and `formatToolArgs` in `input-modes.ts` were identical. Exported `formatArgs` from `tools/index.ts`; `input-modes.ts` now imports it.

## Files changed

- `src/util/guards.ts` (new)
- `src/util/errors.ts` (new)
- `src/config/index.ts`
- `src/providers/model-cache.ts`
- `src/providers/adapters/openai-compat.ts`
- `src/providers/adapters/openai-responses.ts`
- `src/providers/adapters/anthropic.ts`
- `src/providers/registry.ts`
- `src/commands/model.ts`
- `src/cli/command-dispatcher.ts`
- `src/agent/tools/index.ts`
- `src/cli/input-modes.ts`
- `src/providers/anthropic-cost.ts`
- `src/providers/openai-cost.ts`
- `src/cli/preflight-input-cost.ts`
- `src/agent/loop.ts`
- `docs/map/README.md`
- `docs/map/util/guards.md` (new)
- `docs/map/util/errors.md` (new)

## Verification

`npm run verify:fast` — 9/9 scenarios pass, docs check clean.
