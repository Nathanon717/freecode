# No LLM Calls in `npm test`

**Date:** 2026-05-25

## What was built

Added a two-layer guard ensuring `npm.cmd test` cannot make real LLM calls under any circumstances.

## Problem

`verify:scenarios` already skipped LLM scenarios (`--skip-llm`), and TTY scenarios already stripped provider API keys from the subprocess env. However, non-LLM non-TTY scenarios were spawned with the full `process.env`, which meant:

- Any API key present in the developer's shell would be visible to the subprocess.
- If a future scenario accidentally sent free-text input (not a slash command), `agentLoop` would be reached with a live key and a real LLM call would happen silently.

The Vitest unit tests were already safe — every test that exercises a network-calling function stubs `fetch` before the call, and no test ever calls `agentLoop`.

## Key decisions

**Layer 1 — network:** Strip all `PROVIDER_API_KEY_VARS` from the subprocess env for non-LLM scenarios, mirroring what TTY scenarios already did. Consolidated into a shared `safeBaseEnv` constant computed once from `process.env`.

**Layer 2 — code:** Added `FREECODE_NO_LLM=1` env var support to `agentLoop`. When set, the function returns immediately before any provider resolution or network activity. Non-LLM scenario subprocesses now always set this flag. If a non-LLM scenario ever triggers `agentLoop`, the subprocess writes `Error: LLM calls blocked` to stdout — which fails any scenario with `stdoutAbsent: ["Error:"]`, making the problem visible immediately rather than silently spending tokens.

## Files changed

| File | Change |
|---|---|
| `src/agent/loop.ts` | Guard at top of `agentLoop`: returns early if `FREECODE_NO_LLM=1` |
| `tests/harness/run-scenarios.ts` | Computed shared `safeBaseEnv` (API keys stripped); used it for TTY and non-LLM subprocesses; added `FREECODE_NO_LLM: '1'` to all non-LLM scenario envs |

## Verification

`npm.cmd test` — all 25 scenarios pass, all 128 unit tests pass.
