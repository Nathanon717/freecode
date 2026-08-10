# src/index.ts - CLI Entry Point

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Thin executable entry point. It parses process flags, initializes config/provider probes, creates a `Conversation`, and delegates the REPL/script loop to `src/cli/*`.

## Read When

- Changing CLI startup flags or mode selection.
- Debugging startup provider probes, readline lifecycle, or default model selection.
- Tracing how the executable enters the shared session runner.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

_No exported symbols._
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/paid-guard.ts`](providers/paid-guard.md) ×3

## Tests

`tests/index.test.ts`.

## Budget

226 / 500 lines (274 to spare).

## Env

`DOPPLER_PROJECT`, `FREECODE_MODEL`, `FREECODE_NO_PREFETCH`, `FREECODE_RETRY_STATUS_FILE`
<!-- END GENERATED MAP FACTS -->

## Startup

0. **`-p` is translated to `FREECODE_FREE_ONLY=1` first**, before injection: the guard in [providers/paid-guard.md](providers/paid-guard.md) reads env only (it runs long before argv parsing), so the entry point is what turns the flag into the env var.
0a. `tryInjectDoppler()` runs before anything else (module-level, before the shebang's first `await`): if `DOPPLER_PROJECT` isn't already set, it shells out to `doppler secrets download --project freecode --config dev --format=json --no-file` and injects the result into `process.env`. Pinned to `freecode`/`dev` explicitly — an unpinned call resolves its project from `process.cwd()` via Doppler's own scope table (`~/.doppler/.doppler.yaml`), so it silently returned nothing outside the repo root before this was pinned. Failure (wrong project, no doppler CLI) is swallowed on purpose; see `docs/bug log/24-07-2026c.md`. **In free-only mode it skips `PAID_API_KEY_ENV_VARS`**, so billable credentials never enter the process — filtering at injection rather than deleting afterwards means no later reader can race it. This injection is also why stripping keys in a parent process is not enough on its own (the child re-downloads them), and why the e2e harness sets `DOPPLER_PROJECT: '1'`.
1. Enables diagnostic logging when `-log` is present.
2. Validates arguments (`--model`/`--script`/`-p` presence, `--script` file readability, and that `-p` and `--script` are not combined) **before** importing the runtime graph or opening the DB, so bad invocations exit in milliseconds. The runtime graph pulls the `ai` SDK (~4s cold) and libSQL (~1s); only `child_process`/`fs`/`chalk`/`logger` are statically imported, everything else is loaded via dynamic `import()` after validation passes.
3. Dynamically imports the runtime graph (screen buffer, banner, session modes, conversation/runner, config, db), then creates a process-wide readline interface, sets `projectRoot` to `process.cwd()`, and constructs the `Conversation`.
4. Calls `initStore()` to initialize the libSQL DB client and in-memory model cache.
4a. In interactive TTY mode, fires `getSelectableModels()` in the background (model lists + pricing) so `/model` opens instantly. Suppressed by `FREECODE_NO_PREFETCH=1` (TTY test harness).
5. Loads config and seeds the selected model from `FREECODE_MODEL`, `config.defaultModel`, or `--model <provider:model>`.
6. Routes to script mode or interactive mode. Ollama is probed lazily within each path (via `route()`) rather than unconditionally on startup — this avoids a network round-trip in scripted/e2e mode.

## Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Headless prompt | `-p "<prompt>"` | One turn, read-only unless `--edit`; the final response goes to stdout. Calls `runHeadlessPrompt()` directly, not `runCliSession()`, and always sets free-only. See [cli/headless-prompt.md](cli/headless-prompt.md). |
| Scripted CLI | `--script <file>` | Creates a session and runs `runCliSession()` with `createScriptedMode()`. |
| Interactive CLI | default | Shows banner, performs a startup route probe, sets up bottom UI on TTY, and runs `runCliSession()` with `createInteractiveMode()`. |
| Logging | `-log` | Enables stderr logging before other startup work. |
| Model override | `--model <provider:model>` | Overrides env/config selection for the current process, including scripted e2e runs. |

## State Ownership

- Owns the selected model string, defaulting from `FREECODE_MODEL`/`config.defaultModel` and accepting a `--model` process override.
- Owns process-level readline creation/closure.
- Does not implement slash commands directly; command handling lives in [cli/command-dispatcher.md](cli/command-dispatcher.md).
