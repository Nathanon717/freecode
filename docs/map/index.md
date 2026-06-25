# src/index.ts - CLI Entry Point

**Role:** Thin executable entry point. It parses process flags, initializes config/provider probes, creates a `SessionController`, and delegates the REPL/script loop to `src/cli/*`.

## Exports

None. This is the `#!/usr/bin/env node` executable entry point.

## Read When

- Changing CLI startup flags or mode selection.
- Debugging startup provider probes, readline lifecycle, or default model selection.
- Tracing how the executable enters the shared session runner.

## Startup

1. Enables diagnostic logging when `-log` is present.
2. Validates arguments (`--model`/`--script` presence, `--script` file readability) **before** importing the runtime graph or opening the DB, so bad invocations exit in milliseconds. The runtime graph pulls the `ai` SDK (~4s cold) and libSQL (~1s); only `child_process`/`fs`/`chalk`/`logger` are statically imported, everything else is loaded via dynamic `import()` after validation passes.
3. Dynamically imports the runtime graph (screen buffer, banner, session modes, session controller/runner, config, db), then creates a process-wide readline interface, sets `projectRoot` to `process.cwd()`, and constructs the `SessionController`.
4. Calls `initStore()` to initialize the libSQL DB client and in-memory model cache.
5. Loads config and seeds the selected model from `FREECODE_MODEL`, `config.defaultModel`, or `--model <provider:model>`.
6. Routes to script mode or interactive mode. Ollama is probed lazily within each path (via `route()`) rather than unconditionally on startup — this avoids a network round-trip in scripted/scenario mode.

## Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Scripted CLI | `--script <file>` | Creates a session and runs `runCliSession()` with `createScriptedMode()`. |
| Interactive CLI | default | Shows banner, performs a startup route probe, sets up bottom UI on TTY, and runs `runCliSession()` with `createInteractiveMode()`. |
| Logging | `-log` | Enables stderr logging before other startup work. |
| Model override | `--model <provider:model>` | Overrides env/config selection for the current process, including scripted scenarios. |

## State Ownership

- Owns the selected model string, defaulting from `FREECODE_MODEL`/`config.defaultModel` and accepting a `--model` process override.
- Owns process-level readline creation/closure.
- Does not implement slash commands directly; command handling lives in [cli/command-dispatcher.md](cli/command-dispatcher.md).

## Key Neighbors

- [cli/session-runner.md](cli/session-runner.md): owns the shared REPL/script loop.
- [cli/session-modes.md](cli/session-modes.md): creates interactive and scripted session modes.
- [cli/command-dispatcher.md](cli/command-dispatcher.md): handles slash commands.
- [providers/registry.md](providers/registry.md): used for startup probe and provider tests.
- [providers/db.md](providers/db.md): `initStore()` called here at startup.

## Update Triggers

Update this page when startup flags, mode ownership, or top-level runtime flow changes.
