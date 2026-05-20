# Dynamic OpenRouter Free Models

**Date:** 2026-05-20

## What was built

Replaced the hardcoded list of OpenRouter free models in the provider registry with a live fetch from the OpenRouter public API (`https://openrouter.ai/api/v1/models`). The fetch filters to models whose ID ends in `:free`, which is OpenRouter's canonical marker for always-free tier models.

## Key decisions

- **`:free` suffix only** — an earlier version also filtered by `pricing.prompt === '0' && pricing.completion === '0'`, but that caught audio generation models and internal routing aliases. The `:free` suffix is the reliable signal.
- **Lazy init with guard flag** — `initOpenRouterModels()` in `registry.ts` is idempotent and runs once; subsequent calls are no-ops. Called at the top of `route()` in `router.ts`.
- **Fallback list** — if the fetch fails (network error, bad response, empty result), the registry falls back to three known-stable free models so the provider remains usable offline.
- **Docs generator also fetches** — `scripts/generate-docs.ts` calls `initOpenRouterModels()` before generating the providers table, so `docs/providers.md` reflects the live list rather than showing an empty models column.

## Files changed

- `src/providers/registry.ts` — added `initOpenRouterModels()`, removed hardcoded models array for OpenRouter
- `src/providers/router.ts` — import and call `initOpenRouterModels()` at start of `route()`
- `scripts/generate-docs.ts` — call `initOpenRouterModels()` before generating provider table
- `docs/providers.md` — regenerated (now shows ~18 live free models instead of stale 7)

## Verification

```powershell
npm run build
npm run verify:fast
```
