> **Note for AI agents:** `CLAUDE.md` and `AGENTS.md` are identical — `CLAUDE.md` is a symlink to `AGENTS.md`. If you are reading this file, **do not read the other one**; it contains the exact same content and reading both wastes tokens.

# Freecode Development Guide

## Agent Rules

- Run `npm run build` after every code change.
- Always run `npm` commands via the **Bash tool**, not the PowerShell tool — PowerShell blocks npm due to execution policy (`UnauthorizedAccess`).
- If `bash.exe` is present but fails to launch before `npm` runs, invoke `npm.cmd` through `cmd /c` instead. This avoids PowerShell's npm script policy while keeping commands on Windows Node.

## Verification

**Every task that touches `src/` must be verified end-to-end before being reported complete.**

### Commands

```powershell
npm run verify        # Build + run non-LLM scenarios only
npm run verify:fast   # Run non-LLM scenarios only without rebuilding (fastest sanity check)
npm run eval          # Build + run LLM eval scenarios with detailed breakdown
```

Inside the CLI, use `/test` to open the non-LLM verification menu. Use `/eval` to list LLM evals, select one or many, and run them sequentially.

### Rules

1. Run `npm run verify:fast` before reporting any change to `src/` complete. Build failures and scenario failures are **blockers** — do not report success on top of them.
2. If the change introduces user-visible behavior (new flag, new slash command, new tool, changed output format), check whether an existing scenario covers it. If not, add a scenario in `tests/scenarios/` as part of the same change.
3. LLM-dependent scenarios (`"requiresLlm": true`) run under `/eval` or `npm run eval`. They are intentionally excluded from `npm run verify` and `npm run verify:fast` because they call real providers.

For the full scenario authoring reference, see `docs/testing-scenarios.md`.

## Session Logs

After completing any new feature or significant change, ask the user:

> "Want me to write a session log for this?"

If they say yes, create a file at `docs/sessions/YYYY-MM-DD-<slug>.md` (use today's date and a short kebab-case slug describing the feature). Use this structure:

```markdown
# <Feature name>

**Date:** YYYY-MM-DD

## What was built
<1-3 bullet points — what exists now that didn't before>

## Key decisions
<Any non-obvious choices made and why>

## Files changed
<List of files added or modified>

## How to verify
<The verify command(s) to confirm it works>
```

Do not write the log unless the user confirms. Do not log routine fixes, refactors, or investigation-only sessions — only new features or substantial additions.

## MCP Server (for Claude Code)

A project-local MCP server at `src/mcp-server.ts` is registered in `.claude/settings.json`. When working in this project, Claude Code can call the freecode agent directly using these tools:

| Tool | Description |
|------|-------------|
| `freecode_chat(message)` | Send a task to the agent; history accumulates across calls |
| `freecode_new_project(name?)` | Create a folder under `playground/`, set it as the agent's CWD, clear history |
| `freecode_set_cwd(path)` | Point the agent at an existing absolute path; clear history |
| `freecode_clear` | Wipe history and start a fresh session (keeps current CWD) |
| `freecode_set_model(model)` | Switch provider:model (e.g. `"groq:llama-3.3-70b-versatile"`) |
| `freecode_status` | Show current model, CWD, session ID, and message count |

The server runs via `npx tsx src/mcp-server.ts` and is started automatically by Claude Code.

### Working directory

By default the agent's CWD is wherever the MCP server process started. Use `freecode_new_project` to spin up a fresh isolated folder under `playground/` (sibling of `src/`), or `freecode_set_cwd` to point at any existing absolute path. All agent tools (`read_file`, `write_file`, `list_dir`, `grep`, `shell_exec`) resolve paths relative to this CWD — the agent cannot escape it unless explicitly redirected.

Typical workflow for a test scenario:
1. `freecode_new_project("my-scenario")` → creates `playground/my-scenario/`, switches CWD
2. `freecode_chat("scaffold a Node project with …")` → agent works entirely inside that folder
3. `freecode_status` to confirm CWD if needed

## Overview

Freecode is a CLI coding agent in TypeScript that supports multiple LLM providers. It provides an interactive REPL, a scripted test harness, multi-step tool-calling (read/write/grep/shell/list), session persistence, and an MCP server for Claude Code integration.

## Project Structure

```
freecode/
├── src/
│   ├── index.ts              # CLI entry point (--test, --test-all)
│   ├── mcp-server.ts         # MCP server (Claude Code integration)
│   ├── agent/
│   │   ├── context.ts        # Shared mutable projectRoot (set per-session)
│   │   ├── loop.ts           # Agent loop (streamText + tool calls)
│   │   ├── system-prompt.ts  # System prompt builder
│   │   └── tools/            # read_file, write_file, grep, shell_exec, list_dir
│   ├── config/
│   │   └── index.ts          # Config loading from ~/.config/freecode/config.json
│   ├── db/
│   │   └── client.ts         # JSON file storage for sessions (~/.config/freecode/sessions.json)
│   └── providers/
│       ├── types.ts          # TypeScript interfaces
│       ├── registry.ts       # Provider definitions
│       ├── router.ts         # Provider selection (MAIN LOGIC)
│       ├── ollama.ts         # Ollama auto-detection
│       └── adapters/
│           └── openai-compat.ts   # OpenAI-compatible provider adapter
├── playground/               # Isolated folders created by freecode_new_project
├── tests/                    # Unit tests (vitest)
├── vitest.config.ts          # Vitest configuration
└── package.json
```

## CLI Commands

```powershell
npm run build         # Build
npm run test          # Test provider routing (gets actual model response)
npm run test-all      # Test all providers (HTTP health check only)
npm run dev           # Development mode
npm run unit          # Unit tests (vitest)
npm run verify        # Build + run non-LLM scenarios
npm run verify:fast   # Run non-LLM scenarios only (no rebuild)
npm run eval          # Build + run LLM eval scenarios with detailed breakdown
```

## Platform

**Windows only.** Run all commands in PowerShell or cmd. Do not use WSL — env vars set in WSL are not visible to Windows Node processes.

## Key Implementation Details

### Router Logic
The router:
1. If `modelPreference` starts with `ollama`, routes to Ollama (requires `useOllama: true` in config)
2. If `modelPreference` is `<providerId>:<modelId>`, uses that exact provider and model
3. Otherwise, iterates through `PROVIDER_REGISTRY` in order and picks the first one with a valid API key
4. Falls back to Ollama if available and `useOllama: true`

## Providers

For the full provider list, how to test providers, how to add a new provider, and API key setup, see `docs/providers.md`.

## Future (Phase 2+)

- More sophisticated routing
- Context management
- Additional tool integrations
- Mock LLM provider for fully hermetic CI runs
