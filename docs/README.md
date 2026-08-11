# Freecode Docs

Use this directory as the project handbook. Generated reference pages report facts from code and test metadata; human-written pages explain workflows and decisions.

## Start Here

- [Documentation maintenance](docs.md): source-of-truth rules for generated and human-written docs.
- [Commands](commands.md): generated npm script and slash command reference.
- [Providers](providers.md): generated provider registry plus provider setup notes.
- [E2e test inventory](e2e-inventory.md): generated inventory of e2e tests.
- [E2e test authoring](e2e-testing.md): how to write and maintain e2e tests.
- [Writing unit tests](unit-tests.md): behavior-first testing rules to prevent test-file bloat. Read before writing unit tests.
- [Test pipeline timing](scripts/time.md): per-section timing tool to identify pipeline bottlenecks.
- [Model availability smoke test](scripts/test-all-models.md): sends "hi" to every free model to check which ones currently respond.
- [Sweeps](sweeps.md): one bare LLM call per unit across a tree. How to run one (`npm run dead-code`, `npm run map-drift`, `npm run intent-drift`), how to write one, and the candidates not yet written.
- [Line limit](line-limit.md): the 500-line hard limit and extraction guidance.
- [Codebase map](map/README.md): agent-oriented source navigation — one page per source file, queried by section with `npm run map`. See [Codebase Map](#codebase-map) below.
- [Map generation candidates](ideas/map-generation-candidates.md): derived map sections that were costed and **not built**, each with the evidence that shelved it. Read before proposing a new generated section, so a rejected one is not re-derived.
- [PTY session](pty-session.md): drive the live TUI from the shell, exactly as a human would.
  <!-- BEGIN GENERATED PTY QUICKSTART REF -->
For usage only, read lines 1–72.
<!-- END GENERATED PTY QUICKSTART REF -->
- [Freecode as a subagent](subagents/README.md): how a paid lead agent delegates work to free `freecode -p` subagents — when to delegate, verified recipes, known failures, and the capped list of source changes that would make delegation better.
- [Session logs](sessions/README.md): optional records of substantial feature work.
- [New device setup](device-setup.md): install Doppler, link the project, and get all API keys + DB sync in one step.

## Codebase Map

[`map/`](map/README.md) is the navigation layer for `src/`: one page per `src/**/*.ts` file, at
identical depth. Its purpose is token reduction — an agent decides which files matter without
reading them. It has no human-facing audience, so pages stay terse.

**Query it, don't read it.** `npm run map` pulls one section across many pages, or one section
from one page, without paying for the rest. Full verb table in [map/README.md](map/README.md#querying).

```powershell
npm run map -- role store/                      # what every file under a path is for
npm run map -- section "read when" agent/       # when to open each of them
npm run map -- exports src/agent/loop.ts        # signatures + JSDoc only
npm run map -- neighbors-of agent/loop          # who imports it
```

**Generated head, authored tail.** Every page is the same shape: `Role`, `Read When`,
`Exports`, `Neighbors`, `Tests`, `Budget`, `Env` — all derived — then one free-form authored
tail. [map/README.md](map/README.md#page-shape) is the contract; `scripts/checks/check-map.ts`
enforces it inside `npm run docs:generate`.

**Intent lives beside the code it describes**, not on the page, so it is edited in the same
diff that invalidates it:

| Intent | Source of truth |
| --- | --- |
| What a module is for | `@role` in its module header |
| When to open it | `@readwhen` in the same header |
| What one export does | that export's JSDoc |
| Everything else on the page | the authored tail, edited on the page |

Ownership rules are in [docs.md](docs.md#codebase-map). Structural checks cannot tell whether a
tag still *describes* its code; [sweeps](sweeps.md) can — `npm run intent-drift` audits the
source tags, `npm run map-drift` audits the authored tails. Before proposing a new generated
section, read [map generation candidates](ideas/map-generation-candidates.md).

## Tests

The exact file and folder structure of `src/` is mirrored in `tests/`. Every `.ts` file in `src/` must have a corresponding `.test.ts` file in `tests/`. 
So you always know the exact path to a `.ts` files corresponidng unit tests. This mirroring is enforced via the `npm test` pipeline.

## Maintenance

Run `docs:generate` before reporting docs work complete. It checks generated docs first; if they are current, it does not rewrite them, and if they are stale, it regenerates them.

```powershell
npm run docs:generate
```

When generated sources change, update the source of truth first, then run:

```powershell
npm run docs:generate
```
