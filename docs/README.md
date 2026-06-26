# Freecode Docs

Use this directory as the project handbook. Generated reference pages report facts from code and test metadata; human-written pages explain workflows and decisions.

## Start Here

- [Documentation maintenance](docs.md): source-of-truth rules for generated and human-written docs.
- [Commands](commands.md): generated npm script and slash command reference.
- [Providers](providers.md): generated provider registry plus provider setup notes.
- [Scenarios](scenarios.md): generated inventory of verification and eval scenarios.
- [Scenario authoring](testing-scenarios.md): how to write and maintain scenario tests.
- [Test pipeline timing](time.md): per-section timing tool to identify pipeline bottlenecks.
- [Guidelines](guidelines/file-length.md): file length limits and extraction guidance.
- [Codebase map](map/README.md): agent-oriented source navigation.
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
