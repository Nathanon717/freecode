# Freecode Docs

Use this directory as the project handbook. Generated reference pages report facts from code and test metadata; human-written pages explain workflows and decisions.

The codebase map is the way into `src/`, and `npm run map` is the way into the map: it pulls one section across many pages, so a question about a whole directory costs one call instead of a directory of reads. Query first; open a page only once a query has told you which file matters. Verbs, page contract and structure tree live in [map/README.md](map/README.md).

## Start Here

- [Codebase map](map/README.md): the `npm run map` verb reference and the page contract — one page per source file, queried by section.
- [Documentation maintenance](doc-maintenance.md): source-of-truth rules for generated and human-written docs.
- [Commands](commands.md): generated npm script and slash command reference.
- [Providers](providers.md): generated provider registry plus provider setup notes.
- [E2e test inventory](e2e-inventory.md): generated inventory of e2e tests.
- [E2e test authoring](e2e-testing.md): how to write and maintain e2e tests.
- [Writing unit tests](unit-tests.md): the `src/`↔`tests/` mirror plus behavior-first testing rules. Read before writing unit tests.
- [Test pipeline timing](scripts/time.md): per-section timing tool to identify pipeline bottlenecks.
- [Model availability smoke test](scripts/test-all-models.md): sends "hi" to every free model to check which ones currently respond.
- [Sweeps](sweeps.md): one bare LLM call per unit across a tree. How to run one (`npm run dead-code`, `npm run map-drift`, `npm run intent-drift`), how to write one, and the candidates not yet written.
- [Line limit](line-limit.md): the 500-line hard limit and extraction guidance.
- [Map generation candidates](ideas/map-generation-candidates.md): derived map sections that were costed and **not built**, each with the evidence that shelved it. Read before proposing a new generated section, so a rejected one is not re-derived.
- [PTY session](pty-session.md): drive the live TUI from the shell, exactly as a human would.
  <!-- BEGIN GENERATED PTY QUICKSTART REF -->
For usage only, read lines 1–72.
<!-- END GENERATED PTY QUICKSTART REF -->
- [Freecode as a subagent](subagents/README.md): the workshop for delegation to free `freecode -p` subagents — verified recipes, known failures, and the capped list of source changes that would make delegation better. When to delegate is in `AGENTS.md`, not here; read this when improving delegation itself.
- [Agent undo snapshots (plan)](undo-snapshots-plan.md): approved, unbuilt design for automatically snapshotting the project before an agent's first write so any run can be undone after the fact. Verified git facts included — read before touching snapshot/restore.
- [Session logs](sessions/README.md): optional records of substantial feature work.
- [New device setup](device-setup.md): install Doppler, link the project, and get all API keys + DB sync in one step.
