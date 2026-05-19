# Model Data Source Catalog

**Date:** 2026-05-19

## What was built
- Static model data source catalog in `src/providers/model-sources.ts`.
- `/sources` slash command, plus `/model-sources` alias, to display the catalog in the CLI.
- Non-LLM scenario coverage for `/sources`.
- Unit coverage for source catalog helpers and copy behavior.
- Map/generated-doc updates for the new source file and command.

## Key decisions
- **Display first, gatherers later:** The catalog records provenance, trust, machine readability, coverage, provided data, caveats, and recommended use without adding token-cost estimation or routing behavior.
- **Keep it separate from provider routing:** `model-sources.ts` is independent from `registry.ts`, so future scrapers can use it without changing model selection.
- **Treat sources by role:** The catalog distinguishes official sources, gateway sources, aggregators, observability references, and comparison references.

## Files changed
- `src/providers/model-sources.ts` - new source catalog and helpers.
- `src/cli/command-dispatcher.ts` - renders `/sources` and `/model-sources`.
- `src/cli/slash-commands.ts` - adds `/sources` to help/completion.
- `src/scenario-classification.ts` - marks `/sources` and `/model-sources` as non-LLM script commands.
- `tests/model-sources.test.ts` - unit tests for catalog content and copy behavior.
- `tests/scenarios/slash-sources.scenario.json` - scenario test for the new slash command.
- `docs/map/**`, `docs/commands.md`, and `docs/scenarios.md` - documentation updates.

## How to verify
```powershell
npm.cmd run build
npm.cmd run verify:fast
npx.cmd vitest run tests/model-sources.test.ts
```
