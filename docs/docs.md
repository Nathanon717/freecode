# Documentation Maintenance

Freecode keeps documentation current by splitting docs into two kinds:

- Human-written docs for intent, workflows, tradeoffs, and troubleshooting.
- Generated reference docs for facts already defined in code or scenario files.

Do not hand-edit content between `BEGIN GENERATED` and `END GENERATED` markers. Change the source of truth, then run the docs generator.

## Commands

```powershell
npm run docs:generate
npm run docs:check
npm test
```

- `docs:generate` rewrites generated sections.
- `docs:check` verifies generated sections are current, then checks that `docs/map/` structurally covers `src/`.

Use `cmd /c npm.cmd ...` if PowerShell blocks npm scripts or `bash.exe` cannot launch.

## Generated References

Generated references are owned by `scripts/generate-docs.ts`.

Current generated sections:

- `docs/providers.md`: provider registry table from `src/providers/registry.ts`.
- `docs/commands.md`: npm scripts from `package.json` and slash commands from `src/cli/slash-commands.ts`.
- `docs/scenarios.md`: scenario index from `tests/scenarios/*.scenario.json`.

When changing any source of truth, run:

```powershell
npm run docs:generate
```

Then review the generated diff. If the generated output is wrong, fix the source metadata or generator; do not patch the generated table by hand.

## Source Of Truth

Use these ownership rules:

- Provider facts belong in `src/providers/registry.ts`.
- Slash command names and descriptions belong in `src/cli/slash-commands.ts`.
- Npm script facts belong in `package.json`.
- Scenario names, descriptions, workspaces, and LLM classification belong in `tests/scenarios/*.scenario.json`.
- Why a decision exists belongs in an ADR under `docs/architecture/adr/`.

Generated docs should report facts. Human-written docs should explain how to use those facts.

## Codebase Map

`docs/map/` is an agent navigation layer, not a reference manual. It should say where code lives, what owns what, and which files are worth reading first. Reference facts belong in generated docs or source metadata.

The map checker in `scripts/check-map.ts` enforces these structural rules:

- every `src/**/*.ts` file has a matching `docs/map/**/*.md` page;
- every map page, except `docs/map/README.md`, points to an existing source file;
- every source map page is linked from `docs/map/README.md`.

## ADRs

Architecture Decision Records live in `docs/architecture/adr/`.

Create an ADR for durable decisions that future maintainers need to understand before changing a boundary, workflow, or user-visible policy. Good ADR topics include provider routing rules, verification policy, CLI ownership boundaries, or generated-docs policy.

Do not create ADRs for routine fixes, small refactors, typo fixes, or implementation notes that belong near the code.

To add one:

1. Copy `docs/architecture/adr/template.md`.
2. Name it with the next four-digit sequence and a short slug, for example `0005-generated-docs-policy.md`.
3. Keep it short: context, decision, consequences.

## Examples

- Adding a provider: update `src/providers/registry.ts`, config wiring if needed, then run `npm run docs:generate`.
- Adding a slash command: update `src/cli/slash-commands.ts`, command dispatch behavior, a scenario if user-visible, then run `npm run docs:generate`.
- Adding a scenario: add `tests/scenarios/*.scenario.json`, then run `npm run docs:generate`.
- Changing verification policy: update `AGENTS.md`, affected npm scripts, and add or update an ADR.

## Review Checklist

Before reporting a docs-related or user-visible change complete:

- Run `npm run docs:generate` if generated sources changed.
- Run `npm run docs:check`.
- Run `npm test` for changes that touch `src/` or scenario behavior.
- Confirm generated sections were not hand-edited.
- Confirm major architectural decisions are captured as ADRs.
