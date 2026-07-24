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

### 3. That's it — no shell wrapper needed

Freecode self-injects Doppler secrets on every launch: `tryInjectDoppler()` in
`src/index.ts` runs before anything else and calls
`doppler secrets download --project freecode --config dev --format=json --no-file`,
pinned explicitly so it works from any directory, not just inside the repo. Plain
`freecode` (however your shell resolves it — npm global shim, `dist/index.js`
directly, doesn't matter) picks up all keys as long as `doppler login` has been
run once on the machine. See [map/index.md](map/index.md#startup).

A wrapper is only needed for two things `tryInjectDoppler` doesn't cover:

- Scripts run via `npx tsx` instead of the built CLI (`scripts/diagnostics/test-all-models.ts`,
  `npm run pty`) — these call the same `tryInjectDoppler()`, so they're covered too, but if you
  add a *new* script that shells out to `doppler` directly, pin `-p freecode -c dev` on it —
  see [Failure mode](#failure-mode-empty-store).
- Non-Doppler env overrides (`FREECODE_HOME`, `FREECODE_STORE`) that you want set for every
  launch regardless of Doppler.

If you want one anyway:

**Windows** — a `.cmd` wrapper on `PATH`, in a directory that precedes the npm global
directory (e.g. `~\bin\freecode.cmd`):
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

### Failure mode: empty store

If secrets do not reach the process, freecode starts **without error** and behaves as a
fresh install: no saved config, no provider overrides, an empty model list. There is no
warning — the missing values simply read as absent.

The chain: `tryInjectDoppler()`'s `doppler secrets download` fails (wrong/no project scope,
`doppler login` never run, `doppler` CLI missing) → swallowed on purpose → no
`FREECODE_DB_SYNC_URL` / `FREECODE_DB_AUTH_TOKEN` → `readDbConfig()` returns empty → the
tokenless-replica decline in `src/store/db.ts` refuses to open the existing replica (opening
it as a plain client would corrupt the sync metadata) → the store degrades to an empty
in-memory cache. See [map/store/db.md](map/store/db.md).

Confirm secrets are actually arriving:
```sh
doppler run -p freecode -c dev -- node -e "console.log(!!process.env.FREECODE_DB_SYNC_URL)"
```
If this prints `false`, or `doppler run` reports `You must specify a project`, check
`doppler login` status (`doppler me`) — an unpinned `doppler` invocation elsewhere in your
setup will still fail outside the repo, since it resolves its project from the **current
directory** via the scope table in `~/.doppler/.doppler.yaml`. See
`docs/bug log/24-07-2026c.md`.

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
