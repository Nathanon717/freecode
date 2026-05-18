# Scenario Harness Upgrade

**Date:** 2026-05-17

## What was built

- Scenario harness support for temp workspaces, exact file assertions, and structured tool trace assertions.
- A provider-backed `write-hello-world-file` scenario that checks `output.txt`, exact content, and efficient tool use.
- Explicit test split: non-LLM scenarios run through `verify`; LLM scenarios only run through `verify:llm`.

## Key decisions

- Kept `tests/harness/run-scenarios.ts` as the main E2E runner instead of adding a parallel runner.
- Added `FREECODE_TRACE_JSON` so process checks use structured tool events instead of scraping terminal output.
- Moved detailed scenario authoring guidance to `docs/testing-scenarios.md` to keep `AGENTS.md` and `CLAUDE.md` short.

## Files changed

- `src/agent/tools/index.ts`
- `tests/harness/run-scenarios.ts`
- `tests/scenarios/write-hello-world-file.scenario.json`
- `tests/tool-integration.test.ts`
- `src/e2e-test.ts`
- `package.json`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/testing-scenarios.md`

## How to verify

```powershell
npm run verify
npx vitest run tests/tool-integration.test.ts
npm run verify:llm
```
