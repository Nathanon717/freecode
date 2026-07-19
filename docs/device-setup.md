# New Device Setup

API keys and the Turso DB credentials are synced via [Doppler](https://doppler.com). Set it up once on a new machine and all secrets are available automatically.

## Steps

### 1. Install Doppler

**Windows:**
```powershell
winget install Doppler.doppler
```

**Linux / macOS:**
```bash
curl -Ls https://cli.doppler.com/install.sh | sh
```

### 2. Authenticate and link the project

```sh
doppler login
doppler setup   # select project: freecode, config: dev
```

### 3. Add the shell wrapper

Freecode must be launched via `doppler run --` so secrets are injected into the process.

Always pass `-p freecode -c dev` explicitly. Without them, `doppler run` resolves the
project from the **current directory** via the scope table in `~/.doppler/.doppler.yaml`,
so it only works inside the repo (and its subdirectories) — see [Failure mode](#failure-mode-empty-store).

**Windows** — a `.cmd` wrapper on `PATH` covers every shell, including `cmd.exe`, where a
PowerShell profile function does not exist. Put this in a directory that precedes the npm
global directory on `PATH` (e.g. `~\bin\freecode.cmd`) so it shadows the npm shim:
```bat
@echo off
doppler run -p freecode -c dev -- node "C:\path\to\freecode\dist\index.js" %*
```
Call `dist\index.js` directly, not `freecode.cmd` — a wrapper that shadows the shim and
then invokes it by name recurses into itself.

**Linux / macOS** — add to `~/.bashrc` or `~/.zshrc`:
```bash
function freecode() { doppler run -p freecode -c dev -- freecode "$@"; }
```

That's it. Open a new terminal and `freecode` works with all keys in place.

### Failure mode: empty store

If secrets do not reach the process, freecode starts **without error** and behaves as a
fresh install: no saved config, no provider overrides, an empty model list. There is no
warning — the missing values simply read as absent.

The chain: no `FREECODE_DB_SYNC_URL` / `FREECODE_DB_AUTH_TOKEN` → `readDbConfig()` returns
empty → the tokenless-replica decline in `src/store/db.ts` refuses to open the existing
replica (opening it as a plain client would corrupt the sync metadata) → the store degrades
to an empty in-memory cache. See [map/store/db.md](map/store/db.md).

Confirm secrets are actually arriving:
```sh
doppler run -p freecode -c dev -- node -e "console.log(!!process.env.FREECODE_DB_SYNC_URL)"
```
If this prints `false`, or `doppler run` reports `You must specify a project`, the wrapper
is not injecting — check which binary your shell resolves (`where freecode` on Windows,
`type freecode` on Linux/macOS). A shell that resolves straight to the npm shim bypasses
Doppler entirely.

## What's in Doppler

| Secret | Used for |
|---|---|
| `GROQ_API_KEY` | Groq provider |
| `OPENROUTER_API_KEY` | OpenRouter provider |
| `MISTRAL_API_KEY` | Mistral provider |
| `OPENAI_API_KEY` | OpenAI provider |
| `COHERE_API_KEY` | Cohere provider |
| `CEREBRAS_API_KEY` | Cerebras provider |
| `SILICONFLOW_API_KEY` | SiliconFlow provider |
| `LLM7_API_KEY` | LLM7 provider |
| `HF_TOKEN` | HuggingFace provider |
| `FREECODE_DB_SYNC_URL` | Turso cross-device DB sync |
| `FREECODE_DB_AUTH_TOKEN` | Turso cross-device DB sync |

## Adding a new secret

```sh
doppler secrets set MY_NEW_KEY=value
```

All devices pick it up automatically on next `freecode` launch.

## For AI agents

All secrets (API keys, DB credentials) live in Doppler, not in config files or environment variables baked into the shell. When you need a secret value during a task, fetch it with:

```powershell
doppler secrets get SECRET_NAME --plain
```

Do not assume a key is available in `$env:VAR` — it won't be unless the process was launched via `doppler run --`.

`doppler run` without `-p`/`-c` resolves its project from the current directory, so it fails
outside the repo. Always pin `doppler run -p freecode -c dev -- ...` in scripts and wrappers.
