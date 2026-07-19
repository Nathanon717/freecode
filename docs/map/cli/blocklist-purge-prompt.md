# src/cli/blocklist-purge-prompt.ts - Startup Blocklist Purge Confirmation

**Role:** Startup confirmation that names every stored model a registry blocklist now excludes, and deletes them on Enter.

Runs from `index.ts` before the footer UI is set up, so it can print and read raw keys without contending with the pinned status bar. No-op when nothing matches, so the ordinary launch pays only the store init an interactive session performs anyway.

**Read when:** changing the wording, key handling, or placement of the purge confirmation.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
promptBlocklistPurge(): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- Interactive TTY only. The delete is irreversible and the stated alternative is "quit and edit the blocklist" — neither is answerable by a scripted or piped run, so those runs leave the rows alone.
- Declining records nothing: the prompt returns next launch until the rows are deleted or the blocklist entry is removed. That is deliberate — the user's only lever over the blocklists is editing `provider-catalog.ts`, which needs a restart anyway.

## Key Neighbors

- [providers/blocklist-purge.md](../providers/blocklist-purge.md): detection and deletion.
- [cli/menus/raw-picker.md](menus/raw-picker.md): `runRawKeySession` reads the confirm key.
- [index.md](../index.md): calls this in the TTY branch before the footer UI.

## Update Triggers

Update this page when the prompt moves in the startup sequence or its confirm/decline semantics change.
