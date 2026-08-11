# src/snapshots/semantic-diff.ts - Semantic Diff

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Re-encodes a unified patch as a symbol-and-shape summary for `freecode undo --diff --semantic`. A pure string transform with no imports — undo runs before the heavy module graph loads.

## Read When

- Changing how a delegated change is summarised, or which hunks collapse into a repeated shape.
- A review printed a hunk twice, or dropped one — the one-hunk-one-place invariant is here.
- Adding a file status (rename, binary) the parser does not yet name.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Re-encodes a unified patch as changed files, the symbols they touch, and the
 * repeated shapes among their hunks.
 *
 * Every hunk lands in exactly one place: collapsed into a shape that occurs
 * more than once — with all of its locations named — or printed verbatim under
 * `remaining hunks`. Nothing is summarised away.
 *
 * Symbol attribution comes from git's own hunk-header heuristic, so it is as
 * good as that is: reliable for declarations at column zero, empty or
 * attributed to the enclosing block for indented members.
 */
semanticDiff(patch: string): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/undo.ts`](../cli/undo.md) ×1

## Tests

`tests/snapshots/semantic-diff.test.ts`.

## Budget

250 / 500 lines (250 to spare).
<!-- END GENERATED MAP FACTS -->

## Compression is allowed; elision is not

The module exists for one reader: an agent reviewing another agent's edit, which it must
hold *all* of to judge. So the only licensed move is re-encoding — saying the same thing in
fewer tokens — never dropping part of the change because it looked unimportant. Two rules
fall out, and both are load-bearing:

- **Bodies collapse, locations never do.** Hunks making the identical edit print their body
  once, but every `file:line` stays listed. A change in a file nobody asked for is the most
  valuable signal in the whole review, and it lives entirely in the location list.
- **An unclassifiable hunk is printed, not approximated.** `shapeOf` returns `undefined`
  rather than guessing, and its hunk goes out verbatim under `remaining hunks`.

The invariant that keeps those honest: **every hunk appears exactly once**, as a member of a
repeated shape or as raw text. `tests/snapshots/semantic-diff.test.ts` pins it directly.

## Why a shape seen once is not a shape

A class with one member is printed raw instead of as a `1x` repetition. Collapsing it would
cost a heading and a location line to say what the hunk already said, so the encoding would
grow. Repetition is the only thing that makes the summary smaller than the patch.

## Conservative classification

`replace` requires every line in the hunk to make the *same* token substitution, and equal
token counts on both sides. A hunk where one line does something different is doing more
than one thing, and a one-line summary of it would be a claim the code cannot support.
Insertions and deletions key on their normalized text, which is what catches the common
fan-out — the same import, header, or tag added across N files.

## Symbol names are git's, not ours

Attribution reads the `@@ … @@` trailer git already fills in. That keeps this file a pure
string transform with no imports — `undo` runs before the heavy module graph loads, and a
TypeScript parse here would undo that. The cost is that the heuristic is git's: reliable for
declarations at column zero, blank or attributed to the enclosing block for indented
members. Blank is rendered as no symbol rather than a guess.
