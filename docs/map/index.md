# src/index.ts - CLI Entry Point

**Role:** Thin executable entry point. It parses process flags, initializes config/provider probes, creates a `SessionController`, and delegates the REPL/script loop to `src/cli/*`.

## Exports

None. This is the `#!/usr/bin/env node` executable entry point.

## Read When

- Changing CLI startup flags or mode selection.
- Debugging startup provider probes, readline lifecycle, or default model selection.
- Tracing how the executable enters the shared session runner.

## Startup

1. Creates a process-wide readline interface.
2. Sets `projectRoot` to `process.cwd()`.
3. Enables diagnostic logging when `-log` is present.
4. Loads config, seeds the selected model from `config.preferredModel`, and probes Ollama when `config.useOllama` is true.
5. Routes to a flag mode, script mode, or interactive mode.

## Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Provider smoke test | `--test` | Routes once, sends `Say "freecode is alive" and nothing else.`, denies tool calls, and prints output/usage. |
| Provider status | `--test-all` | Calls `testAllProviders()` and prints pass/fail status for configured providers. |
| Scripted CLI | `--script <file>` | Creates a session and runs `runCliSession()` with `createScriptedMode()`. |
| Interactive CLI | default | Shows banner, performs a startup route probe, sets up bottom UI on TTY, and runs `runCliSession()` with `createInteractiveMode()`. |
| Logging | `-log` | Enables stderr logging before other startup work. |

## State Ownership

- Owns the selected model string, defaulting to `config.preferredModel` when configured.
- Owns process-level readline creation/closure.
- Does not implement slash commands directly; command handling lives in [cli/command-dispatcher.md](cli/command-dispatcher.md).
- Prints Anthropic cost estimates in `--test` mode when the selected provider is Anthropic.

## Key Neighbors

- [cli/session-runner.md](cli/session-runner.md): owns the shared REPL/script loop.
- [cli/input-modes.md](cli/input-modes.md): creates interactive and scripted input modes.
- [cli/command-dispatcher.md](cli/command-dispatcher.md): handles slash commands.
- [providers/router.md](providers/router.md): used for startup probe and provider tests.

## Update Triggers

Update this page when startup flags, mode ownership, or top-level runtime flow changes.
