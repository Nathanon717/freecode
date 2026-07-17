# Line Limit

Every `.ts` file under `src/` must be **500 lines or fewer**. This is a **hard
limit**, enforced by `scripts/checks/check-line-limits.ts`, which runs as part
of `npm test` via `docs:generate`. A file over the limit fails the check and
blocks the build.

When a file exceeds the limit the check prints the offending file(s) followed by
`This is a hard limit. Read docs/line-limit.md.`

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

- **Pure configuration data** can stay in a data file of any size if it has no
  logic and is only read, not executed.
- **Test files** are out of scope — `tests/**` is not checked.
- **Generated files** are out of scope — `dist/**` is not checked.

## After extracting

1. Create a map page for the new file in `docs/map/` (see `docs/map/README.md`
   for format).
2. Update the map page for the changed file.
3. Update `docs/map/README.md`'s structure listing.
4. Run `npm test` to confirm the check passes.

## The check

`scripts/checks/check-line-limits.ts` walks every `.ts` file under `src/`,
counts lines (ignoring a single trailing newline), and exits non-zero listing
any file over `MAX_LINES` (currently 500).
