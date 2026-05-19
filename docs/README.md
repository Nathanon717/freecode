# Freecode Docs

Use this directory as the project handbook. Generated reference pages report facts from code and test metadata; human-written pages explain workflows and decisions.

## Start Here

- [Documentation maintenance](docs.md): source-of-truth rules for generated and human-written docs.
- [Commands](commands.md): generated npm script and slash command reference.
- [Providers](providers.md): generated provider registry plus provider setup notes.
- [Scenarios](scenarios.md): generated inventory of verification and eval scenarios.
- [Scenario authoring](testing-scenarios.md): how to write and maintain scenario tests.
- [Architecture decisions](architecture/adr/README.md): durable design records.
- [Codebase map](map/README.md): agent-oriented source navigation.
- [Session logs](sessions/README.md): optional records of substantial feature work.

## Maintenance

Run generated-doc checks before reporting docs work complete:

```powershell
npm run docs:check
```

When generated sources change, update the source of truth first, then run:

```powershell
npm run docs:generate
```
