# Verification Harness + Session Logging

**Date:** 2026-05-03

## What was built
- `--script <file>` flag on the CLI: feeds a newline-delimited input file through the same command-handling logic as the interactive REPL, then exits cleanly at EOF
- Scenario harness (`tests/harness/run-scenarios.ts`) that discovers `tests/scenarios/*.scenario.json`, runs each via subprocess, and asserts on stdout/stderr/exit code
- `FREECODE_HOME` env var to redirect session storage and config during verify runs, so they never touch `~/.config/freecode/`
- 6 initial scenarios (4 structural / no-LLM, 2 LLM-required)
- `npm run verify` and `npm run verify:fast` scripts
- `docs/sessions/` folder for session logs (this file)

## Key decisions
- **Layer B (`--script`) over Layer A (pty subprocess driver):** Most bugs are caught by running the real built binary with scripted stdin — no pty/timing tricks needed. The interactive subprocess driver is scaffolded but reserved for scenarios that genuinely need it.
- **`FREECODE_HOME` redirection instead of a temp sessions path:** One env var covers both config and DB, keeping verify runs fully isolated without any mock infrastructure.
- **Structural assertions only for LLM scenarios:** Asserting on provider footer `[provider:model]` and absence of `Error:` rather than exact model output keeps LLM-touching scenarios stable across providers.
- **`requiresLlm: false` scenarios run unconditionally:** The fast path (`verify:fast`) gives a usable sanity check with zero keys or network access.

## Files changed
- `src/index.ts` — added `--script` flag parsing, `scriptedLoop()`, `readFileSync` import
- `src/db/client.ts` — `CONFIG_DIR` now respects `FREECODE_HOME`
- `src/config/index.ts` — `globalConfigPath` now respects `FREECODE_HOME`
- `AGENTS.md` — added Verification section and Session Logs section
- `package.json` — added `verify` and `verify:fast` scripts
- `tests/harness/run-scenarios.ts` — new harness runner
- `tests/scenarios/*.scenario.json` — 6 new scenario files
- `docs/sessions/.gitkeep` — new folder scaffold

## How to verify
```powershell
npm run verify:fast   # 4 structural scenarios, no keys needed — should show 4 passed, 2 skipped
npm run verify        # full run — LLM scenarios skip cleanly if no provider available
```
