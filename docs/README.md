# Freecode Docs

Use this directory as the project handbook. Generated reference pages report facts from code and test metadata; human-written pages explain workflows and decisions.

## Start Here

- [Documentation maintenance](docs.md): source-of-truth rules for generated and human-written docs.
- [Commands](commands.md): generated npm script and slash command reference.
- [Providers](providers.md): generated provider registry plus provider setup notes.
- [E2e test inventory](e2e-inventory.md): generated inventory of e2e tests.
- [E2e test authoring](testing-e2e.md): how to write and maintain e2e tests.
- [Writing unit tests](unit-tests.md): behavior-first testing rules to prevent test-file bloat. Read before writing unit tests.
- [Test pipeline timing](scripts/time.md): per-section timing tool to identify pipeline bottlenecks.
- [Model availability smoke test](scripts/test-all-models.md): sends "hi" to every free model to check which ones currently respond.
- [Sweeps](sweeps.md): one bare LLM call per unit across a tree. How to run one (`npm run dead-code`, `npm run map-drift`), how to write one, and the candidates not yet written.
- [Line limit](line-limit.md): the 500-line hard limit and extraction guidance.
- [Codebase map](map/README.md): agent-oriented source navigation.
- [PTY session](pty-session.md): drive the live TUI from the shell, exactly as a human would.
  <!-- BEGIN GENERATED PTY QUICKSTART REF -->
For usage only, read lines 1–72.
<!-- END GENERATED PTY QUICKSTART REF -->
- [Freecode as a subagent](subagents/README.md): how a paid lead agent delegates work to free `freecode -p` subagents — when to delegate, verified recipes, and known failures.
- [Session logs](sessions/README.md): optional records of substantial feature work.
- [New device setup](device-setup.md): install Doppler, link the project, and get all API keys + DB sync in one step.

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
