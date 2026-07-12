# 2026-07-12 — Readability Renames

## What Was Changed

A batch of behavior-preserving renames across `src/` (plus tests and map docs) to remove misleading or interchangeable names. No logic changed — only file names, symbol names, imports, and references. The trigger was an external review that flagged names which don't make the thing's purpose obvious to a new reader (notably the `store`/`cache`/`registry` provider cluster and `context` in an LLM codebase).

## Files Renamed

| Old | New | Why |
|---|---|---|
| `src/agent/context.ts` | `src/agent/workspace.ts` | "context" reads as LLM context window; file is project-root resolution + read-file tracking |
| `src/agent/session-controller.ts` | `src/agent/conversation.ts` | Class was just a message array + projectRoot; "controller" oversold it (class `SessionController` → `Conversation`) |
| `src/agent/prompt-tools.ts` | `src/agent/parsed-tools.ts` | Feature had two names; converged code onto the existing config key `parsedTools` |
| `src/util/keys.ts` | `src/util/keyboard.ts` | "keys" reads as API keys in a key-heavy codebase; it's keyboard input |
| `src/providers/model-store.ts` | `src/providers/model-data.ts` | Per-model persisted data (favorites/evals/settings); "store" collided with db.ts |
| `src/providers/model-cache.ts` | `src/providers/model-list-cache.ts` | On-disk cache of fetched provider model lists |
| `src/providers/model-settings-registry.ts` | `src/providers/model-settings-accessor.ts` | DI shim holding one getter fn — not a registry; "registry" collided with registry.ts |
| `src/providers/registry-data.ts` | `src/providers/provider-catalog.ts` | Static provider definitions (the data) |
| `src/providers/registry.ts` | `src/providers/provider-registry.ts` | Provider runtime: resolveModel, init, dead-model eviction (the logic) |

## Symbols Renamed (no file rename)

| Old | New | Location |
|---|---|---|
| `createTool` | `createFileTool` | `agent/tools/create.ts` — one char from `createTools` (the factory) |
| `withLogging` | `withToolRendering` | `agent/tools/index.ts` — it renders transcript headers/previews, not just logs |
| `markModelDead` | `recordDeadModel` | `providers/model-list-cache.ts` — persists the dead id |
| `invalidateDeadModel` | `retireDeadModel` | `providers/provider-registry.ts` — persists + evicts from live registry |
| `runPromptToolsLoop` | `runParsedToolsLoop` | `agent/parsed-tools.ts` (+ `buildPromptToolsSystemPrompt`, `PROMPT_TOOLS_ADDENDUM`, `promptTools` params/fields → `parsed*`) |
| `getCache` / `setCache` / `type ModelStore` | `getModelData` / `setModelData` / `type ModelDataMap` | `providers/db.ts` — the actual source of the store/cache word-overlap |

## Key Decisions

- **`parsedTools` won the naming, not `promptTools`.** The config setting (`OverridableSettings.parsedTools`, the "Parsed tools" UI row) was already `parsedTools` and is persisted per-model. Renaming the *code* onto it means zero config migration. The config key itself was never touched.
- **Both registry files renamed, not just one.** `provider-catalog.ts` (static data) vs `provider-registry.ts` (runtime) makes the data-vs-logic split explicit; the bare `registry` name was ambiguous against `model-settings-registry`.
- **db.ts internals fixed at the source.** The store/cache confusion originated inside `db.ts` exposing its in-memory model map as `getCache/setCache/ModelStore`. Renaming those (rather than just the sibling files) is what actually removes the interchangeable vocabulary.
- **Constant `PROVIDER_REGISTRY` kept.** Only the file moved; the widely-referenced constant name stayed to limit churn.
- **User-facing / LLM-facing strings left as content.** The "Prompt-Based Tool Protocol" heading sent to the model and the "Parsed tools" config label are behavior with test coverage, not identifiers — not renamed.
- **Historical docs untouched.** `docs/bug log/` and `docs/sessions/` are point-in-time records; old names in them were left as-is.

## How It Was Done

Three sequential Sonnet subagents (agent/util group, providers cluster, parsed-tools convergence), each updating all references repo-wide and leaving `npm run build` + `npm run docs:generate` green. Run sequentially because all three touch shared files (`agent/loop.ts`, `agent/tools/index.ts`) — parallel would corrupt each other. Followed by a manual straggler sweep and full `npm test`.

## Verification

`npm test` passes: build, lint, `docs:generate` (map pages + README regenerated), all scenarios, and 93 test files / 1747 unit tests. Repo-wide grep confirms no straggler references to any old name in `src/` or `tests/` (the remaining `model-cache.json` hits are the on-disk data filename, deliberately preserved). The pre-existing `db-sync-recovery.test.ts` orphan-test warning is unrelated to this work.
