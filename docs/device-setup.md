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

**Windows** — add to `~\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`:
```powershell
function freecode { doppler run -- freecode.cmd @args }
```

**Linux / macOS** — add to `~/.bashrc` or `~/.zshrc`:
```bash
function freecode() { doppler run -- freecode "$@"; }
```

That's it. Open a new terminal and `freecode` works with all keys in place.

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
