# Map Generation Candidates

Derived map-page sections that were designed, costed, and **not built**. One file, not a
folder — these all graduate into the same place (`scripts/docgen/`), so they share a host
and stay visible next to each other rather than accreting as separate wishlists.

Each entry carries the evidence that shelved it and the condition that would unshelve it.
**When one ships, delete its entry** — do not annotate it as done. A shipped generator is
described by `docs/doc-maintenance.md` and its own code, not by a list of things that might exist.

---

## Change coupling

Generate a per-page list of files most often committed alongside this one — evolutionary
coupling, scored by association-rule mining over commit transactions (support, confidence,
lift). The premise: catch coupling the import graph structurally misses.

**Measured on this repo 2026-08-09 and rejected.** A prototype miner over
`git log --name-only`, swept across commit-size caps:

| cap | usable commits | pairs with support ≥3 |
| --- | --- | --- |
| ≤5 files | 75 | 10 |
| ≤10 | 105 | 74 |
| ≤15 | 118 | 184 |
| uncapped | 135 | 622 |

Three failures, in descending severity:

1. **Underpowered.** 269 commits total, of which 135 touch ≥2 src files. Maximum support
   across the whole corpus is **4**. `lift=33.8, conf=1.00` pairs are files touched exactly
   three times that happened to move together — one afternoon's iteration, not a durable
   relationship. Tiny denominators manufacture spectacular lift.
2. **Rename-broken, and renames dominate the output.** Top pairs named
   `cli/eval-menu.ts`, `cli/model-screen.ts`, `agent/tools/edit-file.ts`,
   `providers/router.ts`, `mcp-server.ts`, `agent/context.ts`. None of those files exist.
   The history is largely about a tree that has since been reorganised.
3. **Surviving signal is redundant.** `model-data.ts ↔ db.ts`,
   `commands/config.ts ↔ config/index.ts`, `list-menu.ts ↔ raw-picker.ts`,
   `bottom-ui.ts ↔ screen-buffer.ts`, `conversation.ts ↔ turn-messages.ts` — every one is
   already an import edge, so the generated `Neighbors` block covers it.

**Unshelve at ~1000 commits**, when support counts can clear single digits and the rename
churn has settled. Re-run the sweep before building; do not assume this table still holds.
Confounders to handle then: commit-size weighting, time decay, directionality
(conf A→B ≠ B→A), rename resolution, and the tautological pair — `docs/map/agent/loop.md`
co-commits with `loop.ts` by construction and would otherwise top every list.

## Bug history as a query verb

`npm run map -- bugs <file>` — resolve which `docs/bug log/` entries describe a given
source file.

Deliberately **not** a page section: mostly empty, occasionally long, and an agent can
grep. The one argument that survives is the unknown-unknown — an agent editing `loop.ts`
has no reason to suspect a relevant past fix exists, so it never greps. A verb keeps that
available on demand at zero standing token cost.

**Blocked on an undecided question:** whether bug logs are archival snapshots or living
documents. The log currently cites `src/providers/db.ts`, `src/cli/tool-approval.ts`, and
`src/cli/eval-menu.ts`, none of which exist. If archival, those are correct as written and
the verb must map historic paths through rename history. If living, they are defects to
fix and the verb is a straight grep. Settle that first; the answer changes the
implementation, not the value.

## Reached from

Generate, per page, the entry points from which the file is reachable in the import graph —
`Reached from: /model, /config`. Intended as a derived partial substitute for `Read When`.

Not built because full reachability is useless (nearly everything is reachable from
`index.ts`), so it needs a hand-maintained manifest of ~15 roots: the CLI entry, each slash
command, the eval runner, each tool, the sweep engine. That manifest is authored content
introduced to remove authored content, which is a poor trade unless `Read When` proves
expensive to maintain once it is mandatory.

**Unshelve if** authoring `Read When` across the corpus turns out to be the real cost it
looks like — 42 pages lack one today.

## Tool schema parameters

Six map pages (`create`, `edit`, `grep`, and the other tool pages) carry a hand-written
`## Parameters` table. These describe the **model-facing JSON schema**, not the TypeScript
signature — which is why the generated `## Exports` block does not already cover them.

They are derivable: the descriptions come from the zod `.describe()` calls in the tool
files. Not built because it is a separate generator serving ~9 files, and the tables are
currently accurate. Left as free-form tail sections.

**Unshelve if** a tool's schema and its table drift, or if a second cluster of pages grows
the same kind of table.
