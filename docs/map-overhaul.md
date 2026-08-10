# Codebase Map Overhaul

**This file is temporary and deletes itself.** It is a plan, not a reference. Every fact in
it either migrates to a permanent home when its phase ships, or dies with the phase that
justified it. See [Retirement](#retirement) — read that section before editing anything
here, because it governs how this document ends.

Goal: make `docs/map/` **queryable by section**, and reduce hand-written map content to the
minimum that cannot be derived from source.

## Why

Two problems, both measured across all 115 pages.

**Nothing can query the map.** The same field appears in two syntaxes — an inline bold
`**Key neighbors:**` on some pages and `## Key neighbors` / `## Key Neighbors` /
`## Key Neighbours` on others. There is no grammar to address, so "show me just the
exports of `loop.ts`" or "the role of every page under `agent/`" cannot be asked.

**Every strategy change costs 115 edits.** That cost is what has kept the map's structure
frozen. The fix is not a gentler migration process — it is having almost nothing left that
a script cannot write.

## Target page

```
# src/agent/loop.ts — Agent Loop     GENERATED  (path + @role title)
## Role                              GENERATED  (from @role in source)
## Read When                         GENERATED  (from @readwhen in source)
## Exports                           GENERATED  (+ JSDoc, + external ref counts)
## Neighbors                         GENERATED  (imports / imported-by, ref-weighted)
## Tests                             GENERATED  (emitted even when empty)
## Budget                            GENERATED  (lines vs 500)
## Env                               GENERATED  (omitted when empty)
<free-form H2 tail>                  AUTHORED, optional, uncapped
```

One authored slot, and it is the one no parser could produce.

### Grammar

H2-only. Every addressable field is `## <Exact Name>`, extracted as "this heading to the
next H2". No inline-bold fields, no frontmatter — a second grammar buys nothing the queries
need.

Canonical names are **reserved**: a page using one spells it exactly and puts it in the
order above. The tail is **positional, not name-based** — anything after the canonical head
is `detail`, addressable as a block and enumerable by heading. That is what lets the tail
stay unconstrained and still be machine-readable.

Until the codemod makes position reliable, the query tool classifies by name instead,
resolving every spelling in the corpus through the manifest's alias lists. Those aliases are
also the codemod's input; positional classification replaces them, it does not join them.

### Size caps

- `Role` ≤ 400 chars. Median today is 209, p90 is 395, so this bites 10 pages.
- `Read When` ≤ 3 bullets.
- Tail uncapped.

The caps exist because section-level fetching changes the economics that
`docs/map/README.md` uses to justify terseness. Role and Read When are the sections pulled
in bulk across a glob, so their cost scales with page count and the cap must be hard.
Tail sections are only ever fetched one page at a time.

## Decisions

### Sections deleted outright

- **`Update Triggers`** (51 pages). Roughly 40 restate the Role — *"update this page when
  `agentLoop()`'s inputs/outputs, execution flow, or major consumers change"* is true of
  every page and says nothing. The useful ~11 are coupled artifacts and boundary rules
  wearing the wrong hat (*"`tests/cli/theme.test.ts` pins each token"*, *"do not add
  runtime-learned traits here — those belong in `model-data.ts`"*). **Rescue those into
  Role or the tail before deleting the section.**
- **`Key Neighbors`** (72 pages) → superseded by generated `Neighbors`, which now sits on
  every page, so all 72 carry two `Neighbors` sections until the codemod runs. Their "why
  it matters" prose is exactly what rots, so it goes. **The "no rescue needed" call was
  wrong on 9 pages**, found by re-reading the bodies against the generated block: `loop`
  (the prompt/tool-list agreement rule), `transcript-record`, `transcript-replay`,
  `headless-prompt`, `model-data` (the accessor registration that inverts an import),
  `model-screen`, `pricing-verifier` (no per-turn cost estimate any more),
  `turn-messages`, and `text-encoding` — whose consumers include `scripts/` and `tests/`
  files the graph cannot see at all. Rescue those into the tail; delete the other 63
  outright.
- **`Used By`** (5 pages) → superseded by generated `Imported by`. Same rescue rule: some
  annotations carry cross-file invariants (*"`read` marks files as read after successful
  reads; `edit` checks that state before editing"*), which are not dependency facts and
  must move to the tail first.

### Doc references are a report, not a section

Which non-map docs mention a source file is an **update obligation**, not reading material,
and an obligation delivered as a static section on a page nobody opens is useless.
`docs:generate` prints it against `git diff --name-only`: *"you changed these 4 files;
these 6 docs mention them."* Zero standing token cost, arrives when actionable. This is the
mechanical half of what `Update Triggers` was doing by hand.

### Tail left alone

The ~120 one-off H2s stay untouched, including the near-duplicate clusters (`Behavior` ×12,
`Notes`/`Note` ×8, `Key Facts` ×5, `How It Works` ×4, `Responsibilities` ×3). Reserving
`Behavior` would buy a query working on 12 of 115 pages, and the name does different jobs
in different places. Only normalisation: `Note` → `Notes`, 3 pages.

### Shelved

Change coupling, bug history as a verb, reached-from, and tool-schema parameters are all
in [ideas/map-generation-candidates.md](ideas/map-generation-candidates.md) with the
evidence that shelved them. Do not re-derive them here.

## Phases

1. **Page codemod** — case-fold headings, promote inline fields, reorder, delete superseded
   sections, `Note` → `Notes`. Then the manual residue: ~11 Update Triggers rescues, 5
   Used By rescues, 12 pages the parser reports as carrying orphan prose outside any
   section, 10 over-length Roles.
2. **Enforcement** — `check-map.ts` gains canonical-section and size-cap checks; the
   doc-reference report lands in `docs:generate`. `Read When` becomes mandatory here and
   not before: 42 modules have no `@readwhen`, and authoring them is the single largest
   manual cost in the overhaul.
3. **Retire this file.**

Most of the codemod is deterministic; the manual residue is ~30 small edits once
`Read When` is deferred, and leaving it mandatory would have added 42 authored sections.

`npm run map -- sections <file>` and `role '**'` are the instruments each remaining phase is
verified with: the section manifest they read is the array every generator and check must
also read, and its `legacy` entries are exactly what phases 1–2 delete.

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
| Target page, Grammar, Size caps | `docs/map/README.md` — it already states the schema as a preference; this makes it the contract |
| Generated-vs-authored ownership | `docs/docs.md` § Generated References + § Source Of Truth |
| Enforcement rules | `docs/docs.md` § Codebase Map, which already lists what `check-map.ts` enforces |
| Shelved generators | already in `ideas/map-generation-candidates.md` — nothing to move |
| Phases, migration counts, the 80/20 split | **nothing — these die with the plan** |

That last row is the one to get right. Measurements that justify a *decision* die with the
plan once the decision is encoded; only measurements that would otherwise be **re-run**
earn a permanent home, which is why the change-coupling data sits in the ideas file and the
"158 of 179 bullets" figure does not.

When the table is empty, delete this file and its line in [README.md](README.md).
