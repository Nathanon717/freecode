# src/index.ts - CLI Entry Point

**Role:** Thin executable entry point. It parses process flags, initializes config/provider probes, creates a `SessionController`, and delegates the REPL/script loop to `src/cli/*`.

## Exports

None. This is the `#!/usr/bin/env node` executable entry point.

## Imports

| Symbol | Source |
|--------|--------|
| `agentLoop` | `./agent/loop` |
| `showBanner` | `./cli/banner` |
| `createInteractiveMode`, `createScriptedMode`, `denyToolCallWithPreview` | `./cli/input-modes` |
| `SessionController` | `./cli/session-controller` |
| `runCliSession` | `./cli/session-runner` |
| `setupBottomUI` | `./cli/terminal-ui` |
| `loadConfig` | `./config/index` |
| `enableLog`, `log` | `./logger` |
| `getOllamaModels` | `./providers/ollama` |
| `route`, `testAllProviders` | `./providers/router` |
| `chalk` | npm |
| `createInterface` | Node `readline` |

## Startup

1. Creates a process-wide readline interface.
2. Sets `projectRoot` to `process.cwd()`.
3. Enables diagnostic logging when `-log` is present.
4. Loads config and probes Ollama when `config.useOllama` is true.
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

- Owns the selected model string, currently defaulting to `groq:llama-3.3-70b-versatile`.
- Owns process-level readline creation/closure.
- Does not implement slash commands directly; command handling lives in [cli/command-dispatcher.md](cli/command-dispatcher.md).

## Flow

```text
startup
  -> loadConfig()
  -> getOllamaModels() if enabled
  -> handle special flag, or:
  -> showBanner()
  -> route() startup probe
  -> SessionController.createSession()
  -> setupBottomUI() for interactive TTY
  -> runCliSession(...)
```
