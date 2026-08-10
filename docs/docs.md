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
- `docs/e2e-inventory.md`: e2e test index from `tests/e2e/*.e2e.json`.
- `docs/map/**/*.md`: the `## Role` and `## Read When` sections, lifted from `@role` / `@readwhen` in each source file's module header by `scripts/docgen/map-intent.ts`. Tags are read off the header text, never through the TypeScript checker, which strips them.
- `docs/map/**/*.md`: the `## Exports` block on every map page, extracted from each source file's TypeScript signatures — including each export's JSDoc — by `scripts/docgen/map-exports.ts`.
- `docs/map/**/*.md`: the `## Neighbors`, `## Tests`, `## Budget` and `## Env` sections, derived from the import graph, `tests/`, the line count and the source's `process.env` reads by `scripts/docgen/map-facts.ts`. One marker pair holds all four; a page missing it gets it inserted after its exports block on the next run.
- `docs/map/README.md`: the structure tree / nav links, generated from the source tree and each page's H1.

When changing any source of truth, run:

```powershell
npm run docs:generate
```

Then review the generated diff. If the generated output is wrong, fix the source metadata or generator; do not patch the generated table by hand.

## Source Of Truth

Use these ownership rules:

- Provider facts belong in `src/providers/provider-catalog.ts` (`provider-registry.ts` re-exports it); the model lists for live-fetch providers belong in the committed snapshot `src/providers/model-snapshot.json`, refreshed with `npm run docs:refresh-models`.
- Slash command names and descriptions belong in `src/cli/slash-commands.ts`.
- Npm script facts belong in `package.json`.
- E2e test names, descriptions, and workspaces belong in `tests/e2e/*.e2e.json`.

Generated docs should report facts. Human-written docs should explain how to use those facts.

## Codebase Map

`docs/map/` is an agent navigation layer, not a reference manual. It should say where code lives, what owns what, and which files are worth reading first. Reference facts belong in generated docs or source metadata.

Each page's generated blocks and the README structure tree are facts derived from source — see "Generated References" above. The intent a signature cannot carry is written in the source file too, and lifted: what the module is for and when to open it belong to `@role` / `@readwhen` in its module header, per-export intent belongs to that export's JSDoc. Dependency facts belong to `## Neighbors`, which is derived. Do not hand-write any of those on the page; what stays authored there is the tail below the generated head.

The map checker in `scripts/checks/check-map.ts` enforces two things, and runs inside `docs:generate`:

- **Coverage** — every `src/**/*.ts` file has a `docs/map/**/*.md` page, linked from `docs/map/README.md`; every map page except that README points at an existing source file; every page keeps its generated blocks, and the README its structure block.
- **Page shape** — the contract in [map/README.md](map/README.md#page-shape), enforced as written there: required sections, exact spellings, canonical order above the tail, no orphan prose, and the `Role` / `Read When` size caps.

`docs:generate` then prints which prose docs mention the source files in your working tree: *you changed these 4 files; these 6 docs name them.* Which docs describe a source file is an **update obligation**, not reading material, so it arrives when it is actionable instead of sitting in a static section on a page nobody opens. Nothing fails because of it.

Dated records are excluded — `docs/bug log/` and `docs/sessions/` describe what happened, so an old entry naming a file you just changed is history, not a stale doc. `docs/map/` is excluded too: the generator and the map checker already keep it in step.

## Examples

- Adding a provider: update `src/providers/provider-catalog.ts`, config wiring if needed, then run `npm run docs:generate`.
- Adding a slash command: update `src/cli/slash-commands.ts`, command dispatch behavior, an e2e test if user-visible, then run `npm run docs:generate`.
- Adding an e2e test: add `tests/e2e/*.e2e.json`, then run `npm run docs:generate`.
- Changing verification policy: update `AGENTS.md` and affected npm scripts.

## Review Checklist

Before reporting a docs-related or user-visible change complete:

- Run `npm run docs:generate`.
- Run `npm test` for changes that touch `src/` or e2e behavior.
- Confirm generated sections were not hand-edited.
