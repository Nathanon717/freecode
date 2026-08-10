# Codebase Map Overhaul

**This file is temporary and deletes itself.** It is a plan, not a reference. Every fact in
it either migrates to a permanent home when its phase ships, or dies with the phase that
justified it. See [Retirement](#retirement) — read that section before editing anything
here, because it governs how this document ends.

Goal: make `docs/map/` **queryable by section**, and reduce hand-written map content to the
minimum that cannot be derived from source.

## Decisions

### Doc references are a report, not a section

Which non-map docs mention a source file is an **update obligation**, not reading material,
and an obligation delivered as a static section on a page nobody opens is useless.
`docs:generate` prints it against `git diff --name-only`: *"you changed these 4 files;
these 6 docs mention them."* Zero standing token cost, arrives when actionable. This is the
mechanical half of what `Update Triggers` was doing by hand.

### Shelved

Change coupling, bug history as a verb, reached-from, and tool-schema parameters are all
in [ideas/map-generation-candidates.md](ideas/map-generation-candidates.md) with the
evidence that shelved them. Do not re-derive them here.

## Phases

1. **Enforcement** — `check-map.ts` gains canonical-section, ordering, orphan-prose and
   size-cap checks; the doc-reference report lands in `docs:generate`. `Read When` becomes
   mandatory here and not before: 42 modules have no `@readwhen`, and authoring them is the
   single largest manual cost in the overhaul — leaving it mandatory earlier would have
   added 42 authored sections to the migration. Also here: `npm run map-drift` can no
   longer see purpose or read-when drift at all, because those sections are generated and
   stripped before the model sees the page. Catching it needs a check that reads
   `@role`/`@readwhen` from the source file — a different sweep, not a wider prompt. Written
   up in [bug log/10-08-2026.md](bug%20log/10-08-2026.md).
2. **Retire this file.**

`npm run map -- sections <file>` and `role '**'` are the instruments this phase is verified
with: the section manifest they read is the array every generator and check must also read,
and its `legacy` entries are exactly the spellings the checker starts refusing.

## Retirement

This document is temporary information. The mindset it must not violate is the one in
[subagents/README.md](subagents/README.md#removing): **when a thing ships, delete the entry
— do not rewrite it to say SHIPPED.** A shipped design is described by its code, its
generated output, and `docs/docs.md`. It is not described by a plan that says it happened.

Three rules, in force from now:

**One fact, one file.** Nothing in this document may be copied to its permanent home and
also left here. A number restated in two files drifts in one of them.

**Move the durable fact first, then delete.** The test before deleting a section of this
file is not "was this true once?" but "does the durable fact live somewhere it belongs?"

**Each phase deletes its own section.** Do not batch this to the end, and never annotate a
phase as complete — a completed phase leaves no trace here at all.

Where each part goes:

| Section of this doc | Permanent home on completion |
| --- | --- |
| Generated-vs-authored ownership | `docs/docs.md` § Generated References + § Source Of Truth |
| Enforcement rules | `docs/docs.md` § Codebase Map, which already lists what `check-map.ts` enforces |
| Shelved generators | already in `ideas/map-generation-candidates.md` — nothing to move |
| Phases, migration counts, the 80/20 split | **nothing — these die with the plan** |

That last row is the one to get right. Measurements that justify a *decision* die with the
plan once the decision is encoded; only measurements that would otherwise be **re-run**
earn a permanent home, which is why the change-coupling data sits in the ideas file and the
"158 of 179 bullets" figure does not.

When the table is empty, delete this file and its line in [README.md](README.md).
