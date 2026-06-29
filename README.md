# Freecode

No-cost CLI coding agent.

## What It Does

Freecode runs as an interactive REPL. You describe a coding task and the agent reads, edits, creates, and runs files on your behalf using a set of built-in tools.

## Providers

Freecode ships with support for Groq, OpenRouter, NVIDIA NIM, Mistral, Cohere, Cerebras, Cloudflare Workers AI, GitHub Models, Hugging Face, LLM7, SiliconFlow, Z.ai, OpenCode Zen, OpenAI, and Anthropic. Most are free tiers. Keys are read from environment variables (e.g., `GROQ_API_KEY`, `ANTHROPIC_API_KEY`).

See [docs/providers.md](docs/providers.md) for the full provider and model table, key setup, and instructions for adding new providers.

## Requirements

- Node.js 18+
- Windows (primary). Linux is supported in Claude Code web containers -- see [docs/misc/claude_code_web.md](docs/misc/claude_code_web.md).

## Install

```powershell
npm install
npm run build
```

## Run

```powershell
# Interactive TUI
npm run start

# Dev mode (no build step)
npm run dev

# Run a scripted session from a file
node dist/index.js --script path/to/script.txt

# Override the model for one session
node dist/index.js --model anthropic:claude-sonnet-4-6
```

## Slash Commands

| Command | Description |
| --- | --- |
| `/clear` | Clear screen and chat history |
| `/config` | Open interactive config editor |
| `/eval` | Show and run LLM eval scenarios |
| `/help` | Show help |
| `/humaneval` | Run HumanEval code-completion benchmark |
| `/keys` | Show API key status |
| `/model` | Show or set model |
| `/renderer` | Demo transcript renderer |

## Agent Tools

The agent has access to: `read`, `create`, `edit`, `grep`, `list_dir`, `shell_exec`.

## Configuration

Use `/config` inside the REPL to set defaults interactively, or set `FREECODE_MODEL` as an environment variable to pin a provider and model.

```powershell
# Windows -- persists at user level
[System.Environment]::SetEnvironmentVariable("GROQ_API_KEY", "your-key-here", "User")
```

## Testing

```powershell
npm test
```

This runs the TypeScript build, doc generation, all non-LLM scenario tests, and all unit tests. Build, doc, and scenario failures are blocking.

## Project Layout

```
src/          TypeScript source
tests/        Mirrors src/ exactly; each .ts has a .test.ts
docs/         Handbook, generated references, architecture decisions
scripts/      Build, test, and doc-generation utilities
```

Start at [docs/map/README.md](docs/map/README.md) for source navigation and [docs/README.md](docs/README.md) for the full documentation index.

## License

MIT
