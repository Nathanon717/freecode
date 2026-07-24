# Documentation Maintenance

Freecode keeps documentation current by splitting docs into two kinds:

- LLM-Agent-written docs for intent, workflows, tradeoffs, and troubleshooting.
- Generated reference docs for facts already defined in code or e2e test files.

Do not hand-edit content between `BEGIN GENERATED` and `END GENERATED` markers. Change the source of truth, then run the docs generator.

## Commands

```powershell
npm run docs:generate
npm test
```

- `docs:generate` checks generated sections first. If they are current, it exits without rewriting them; if they are stale, it regenerates them, then checks that `docs/map/` structurally covers `src/`.

Use `cmd /c npm.cmd ...` if PowerShell blocks npm scripts or `bash.exe` cannot launch.

## Generated References

Generated references are owned by `scripts/docgen/generate-docs.ts`.

Current generated sections:

- `docs/providers.md`: provider registry table from `src/providers/provider-registry.ts`; model lists for live-fetch providers come from the committed snapshot `src/providers/model-snapshot.json` (refresh it with `npm run docs:refresh-models`, never a live fetch during generation).
- `docs/commands.md`: npm scripts from `package.json` and slash commands from `src/cli/slash-commands.ts`.
- `docs/e2e.md`: e2e test index from `tests/e2e/*.e2e.json`.
- `docs/map/**/*.md`: the `## Exports` block on every map page, extracted from each source file's TypeScript signatures by `scripts/docgen/map-exports.ts`.
- `docs/map/README.md`: the structure tree / nav links, generated from the source tree and each page's H1.

When changing any source of truth, run:

```powershell
npm run docs:generate
```

Then review the generated diff. If the generated output is wrong, fix the source metadata or generator; do not patch the generated table by hand.

## Source Of Truth

Use these ownership rules:

- Provider facts belong in `src/providers/provider-registry.ts`; the model lists for live-fetch providers belong in the committed snapshot `src/providers/model-snapshot.json`, refreshed with `npm run docs:refresh-models`.
- Slash command names and descriptions belong in `src/cli/slash-commands.ts`.
- Npm script facts belong in `package.json`.
- E2e test names, descriptions, and workspaces belong in `tests/e2e/*.e2e.json`.

Generated docs should report facts. Human-written docs should explain how to use those facts.

## Codebase Map

`docs/map/` is an agent navigation layer, not a reference manual. It should say where code lives, what owns what, and which files are worth reading first. Reference facts belong in generated docs or source metadata.

Each page's `## Exports` block and the README structure tree are generated facts — see "Generated References" above. Hand-written prose (Role, Read When, Export notes, Behavior, Update Triggers, etc.) carries the intent the signatures cannot.

The map checker in `scripts/checks/check-map.ts` enforces these structural rules:

- every `src/**/*.ts` file has a matching `docs/map/**/*.md` page;
- every map page, except `docs/map/README.md`, points to an existing source file;
- every source map page is linked from `docs/map/README.md`;
- every source map page contains its generated exports block, and the README contains its generated structure block.

## Examples

- Adding a provider: update `src/providers/provider-registry.ts`, config wiring if needed, then run `npm run docs:generate`.
- Adding a slash command: update `src/cli/slash-commands.ts`, command dispatch behavior, an e2e test if user-visible, then run `npm run docs:generate`.
- Adding an e2e test: add `tests/e2e/*.e2e.json`, then run `npm run docs:generate`.
- Changing verification policy: update `AGENTS.md` and affected npm scripts.

## Review Checklist

Before reporting a docs-related or user-visible change complete:

- Run `npm run docs:generate`.
- Run `npm test` for changes that touch `src/` or e2e behavior.
- Confirm generated sections were not hand-edited.
