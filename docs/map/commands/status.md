# src/commands/status.ts - /status Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Implements the `/status` slash command. Shows API key status for all providers, Turso DB sync configuration, and whether environment variables are being injected via Doppler.

## Read When

- Adding new fields to the `/status` output.
- Changing Doppler detection logic (looks for `DOPPLER_PROJECT` env var).
<!-- END GENERATED MAP INTENT -->

No state is mutated; output only.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runStatusCommand(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`config/index.ts`](../config/index.md) ×1, [`providers/provider-registry.ts`](../providers/provider-registry.md) ×1, [`store/db.ts`](../store/db.md) ×1

## Tests

`tests/commands/status.test.ts`. 1 other test file references it.

## Budget

51 / 500 lines (449 to spare).

## Env

`DOPPLER_CONFIG`, `DOPPLER_PROJECT`
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [providers/provider-registry.md](../providers/provider-registry.md): `PROVIDER_REGISTRY` for provider list.
- [config/index.md](../config/index.md): `loadConfig()` for config-file API keys.
- [providers/db.md](../store/db.md): `getDbSyncConfig()` for DB sync URL.
- [cli/slash-commands.md](../cli/slash-commands.md): `/status` is registered here.
- [cli/command-dispatcher.md](../cli/command-dispatcher.md): dispatches `/status` to `runStatusCommand`.

## Update Triggers

Update this page when the command output sections change or new status categories are added.
