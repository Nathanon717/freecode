# src/cli/blocklist-purge-prompt.ts - Startup Blocklist Purge Confirmation

**Role:** Startup confirmation that names every stored model a registry blocklist now excludes, and deletes them on Enter.

Runs from `index.ts` after `showBanner()` (so a Turso-synced user is not staring at a blank terminal while the store opens) and before the footer UI is pinned (so its raw-key prompt owns the screen with nothing repainting under it). No-op when nothing matches.

**Read when:** changing the wording, key handling, or placement of the purge confirmation.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
promptBlocklistPurge(): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- Interactive TTY only. The delete is irreversible and the stated alternative is "quit and edit the blocklist" — neither is answerable by a scripted or piped run, so those runs leave the rows alone.
- **Enter is the only resolving key** — there is deliberately no dismiss key. The alternative the prompt offers is editing the blocklists, which needs a restart anyway, so a "continue without deleting" path would be a third outcome the hint does not mention. Ctrl-C quits, which is the advertised escape.
- Quitting records nothing: the prompt returns next launch until the rows are deleted or the blocklist entry is removed.

## Key Neighbors

- [providers/blocklist-purge.md](../providers/blocklist-purge.md): detection and deletion.
- [cli/menus/raw-picker.md](menus/raw-picker.md): `runRawKeySession` reads the confirm key.
- [index.md](../index.md): calls this in the TTY branch before the footer UI.

## Update Triggers

Update this page when the prompt moves in the startup sequence or its confirm/decline semantics change.
