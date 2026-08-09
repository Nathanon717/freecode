# Line Limit

Every `.ts` file under `src/` must be **500 lines or fewer**. This is a **hard
limit**, enforced as part of `npm test`.

## Why

Long files are harder to navigate, tend to accumulate unrelated concerns, and
make ownership hard to track. A predictable ceiling also keeps map pages
(`docs/map/`) tractable — one page per file stays meaningful when files stay
small. The check forces a structural decision instead of letting a file grow
without bound.

## What to do when a file is over the limit

Do **not** raise `MAX_LINES` or exempt the file. Split it.

**First, ask whether the file has multiple concerns.** If it does, extract the
secondary concern — not just any chunk of lines — into a new file. Name the new
file after what it does, not after what you removed.

**Extract cohesive behavior, not arbitrary line ranges.** A good extraction has:
- A clear, standalone name (`input-buffer.ts`, `footer-format.ts`, not
  `terminal-ui-helpers.ts`)
- Its own state or a well-defined input/output contract
- No circular dependency on the file it came from (use `import type` if you only
  need types)

**Move pure helpers** (formatting, parsing, math) into `src/util/`.

**Consider a subfolder when two or more new files belong together.** If
`registry.ts` splits into `registry.ts` + `provider-data.ts`, that may stay
flat. If it splits into four files, a `providers/registry/` subfolder keeps the
area navigable.

**Do not game the limit.** Collapsing blank lines, removing comments, or
inlining short helpers to shrink below 500 is the wrong fix. The limit exists to
prompt a structural decision, not a formatting one.

## What is not checked

- **The module header** — a block comment opening the file (below the shebang,
  if it has one), and the blank line after it — is not counted. That comment holds `@role` and `@readwhen`, which
  the codebase map reads (see `docs/map/README.md`), and a file must not be
  pushed over the limit for stating what it is for. The exemption stops at the
  header: a comment anywhere below it counts like any other line.
- **Pure configuration data** can stay in a data file of any size if it has no
  logic and is only read, not executed.
- **Test files** are out of scope — `tests/**` is not checked.
- **Generated files** are out of scope — `dist/**` is not checked.

## After extracting

1. Create a map page for the new file in `docs/map/` (see `docs/map/README.md`
   for format).
2. Update the map page for the changed file.
3. Run `npm test`. It regenerates `docs/map/README.md`'s structure listing — that
   block is generated, so do not edit it by hand — and confirms the check passes.

## The check

`scripts/checks/check-line-limits.ts` walks every `.ts` file under `src/` and
exits non-zero listing any file over the limit.

`MAX_LINES` (currently 500) and the counting rule — a single trailing newline
does not open a line, and the module header is not counted — live in
`scripts/checks/line-budget.ts`. The `Budget`
section on every map page and the line counts in the map's structure tree read
them from there, so a page can never claim headroom the gate disagrees with.
