# src/snapshots/auto.ts - Automatic Snapshot

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The automatic half of `freecode checkpoint`: one snapshot per process, taken lazily immediately before the first write-tool call. Kept separate from [index.md](index.md) so the snapshot library stays callable more than once per process.

## Read When

- Changing when the automatic snapshot fires, or what happens when it fails — a failure is reported, never swallowed, and [../cli/headless-prompt.md](../cli/headless-prompt.md) is what acts on it.
- Debugging a session that snapshotted twice, or one that captured post-mutation state.
- Changing the retention count applied after each automatic snapshot.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * What this process's snapshot came to. Three states, not two: a run that wrote
 * nothing and a run whose snapshot failed both have no id, and treating them alike
 * is what released the review lock over unprotected work (finding A5/A6).
 */
type SessionSnapshot =
  /** No write tool ever fired, so there was nothing to protect. */
  | { status: 'none' }
  | { status: 'taken'; id: string }
  /** Writes happened and no snapshot covers them. There is nothing to review against. */
  | { status: 'failed'; reason: string };

/**
 * Snapshots the project the first time it is called in this process, and is a
 * no-op every time after.
 *
 * Never rejects. A missing `git` binary, an unwritable config dir, or a corrupt
 * shadow repo must not block the write this was protecting — refusing writes
 * because the safety net is unavailable inverts the point of having one, so the
 * failure is logged and the call proceeds unprotected.
 */
ensureSnapshot(): Promise<void>

/**
 * What this process's snapshot came to, once it has settled.
 *
 * The single answer to "does this run have unreviewed work, and is it
 * reviewable?", so nothing else has to keep a second flag that could disagree.
 * `failed` is deliberately not folded into `none`: the writes happened, and a
 * caller that cannot tell the two apart either abandons unprotected work with the
 * project marked free, or holds the lock over a run that never touched anything.
 * Neither is safe, and the second was the reason the two used to be one — but
 * `checkpoint accept` works with nothing snapshotted and is the documented way
 * out of a held lock, so a `failed` run strands nobody.
 */
sessionSnapshot(): Promise<SessionSnapshot>

/**
 * Test-only: drops the memo so a fresh snapshot can be taken in the same process.
 */
resetSnapshotMemo(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×2, [`snapshots/index.ts`](index.md) ×2, [`agent/workspace.ts`](../agent/workspace.md) ×1
- **Imported by:** [`agent/tools/snapshot-gate.ts`](../agent/tools/snapshot-gate.md) ×1

## Tests

`tests/snapshots/auto.test.ts`. 2 other test files reference it.

## Budget

98 / 500 lines (402 to spare).
<!-- END GENERATED MAP FACTS -->

## Why the memo is at module scope

`createTools()` state is per streamText attempt, not per session. A run-once flag threaded
through it would re-snapshot every turn, and the second snapshot would capture
*post-mutation* state — destroying the thing being protected. One promise per process is the
only scope that means "before the agent touched anything".

The promise is assigned synchronously before the first await, so concurrent first writes
share it instead of each starting a snapshot.

## Failure is not fatal, but it is not silent either

`ensureSnapshot()` never rejects. A missing `git` binary or an unwritable config dir is
logged and the write proceeds unprotected — refusing writes because the safety net is
unavailable inverts the point of having one.

What R4 changed is what happens *after* that. The failure used to go only to the log, and
under `-p` the transcript is silenced, so it reached no caller at all. `sessionSnapshot()`
now answers with three states rather than an id-or-nothing:

| State | Means | What `-p --edit` does with it |
| --- | --- | --- |
| `none` | no write tool ever fired | frees the review lock — there is nothing to review |
| `taken` | the snapshot is in the store | keeps the lock and records the id in it |
| `failed` | writes landed, nothing covers them | keeps the lock and reports it on stderr |

Folding `failed` into `none` — which is what a single `string \| undefined` forced — released
the lock over changes no snapshot covers, marking the project free at the exact moment it was
least reviewable (findings A5/A6 in
[../../agent-containment-audit.md](../../agent-containment-audit.md)). The old rationale for
the conflation was that a `failed` run would strand the project with nothing able to clear the
lock, and that is not true: `checkpoint accept` works with nothing snapshotted and is the
documented way out.

`reason` is one line, not the whole rejection. A failed `git` stringifies to the entire
invocation before the actual fault, and the sentence a reader needs (`fatal: not a git
repository`) is the one that would be buried. The log still has the error entire.
