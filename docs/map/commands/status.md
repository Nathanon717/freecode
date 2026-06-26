# src/commands/status.ts - /status Command

**Role:** Implements the `/status` slash command. Shows API key status for all providers, Turso DB sync configuration, and whether environment variables are being injected via Doppler.

No state is mutated; output only.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runStatusCommand(): void
```
<!-- END GENERATED EXPORTS -->

## Read When

- Adding new fields to the `/status` output.
- Changing Doppler detection logic (looks for `DOPPLER_PROJECT` env var).

## Key Neighbors

- [providers/registry.md](../providers/registry.md): `PROVIDER_REGISTRY` for provider list.
- [config/index.md](../config/index.md): `loadConfig()` for config-file API keys.
- [providers/db.md](../providers/db.md): `getDbSyncConfig()` for DB sync URL.
- [cli/slash-commands.md](../cli/slash-commands.md): `/status` is registered here.
- [cli/command-dispatcher.md](../cli/command-dispatcher.md): dispatches `/status` to `runStatusCommand`.

## Update Triggers

Update this page when the command output sections change or new status categories are added.
