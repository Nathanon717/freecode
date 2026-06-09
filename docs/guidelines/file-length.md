# File Length Guidelines

Source files under `src/` are limited to **500 lines**. The limit is enforced by `scripts/check-line-limits.ts`, which runs as part of `npm test` via `docs:generate`.

When a file exceeds 500 lines the check prints:

```
src/path/to/file.ts has exceeded the 500 line limit. reduce its line count by simplifying the code or extracting to another file. consider if a new subfolder is appropriate.
```

## Why 500 lines

Long files are harder to navigate, tend to accumulate unrelated concerns, and make it harder to track ownership. 500 lines is a signal, not a hard correctness boundary — a file that is 480 lines and has three unrelated concerns is worse than a 520-line file with a single clear purpose. But the check forces a decision.

## What to do when a file is over the limit

**First, ask whether the file has multiple concerns.** If it does, extract the secondary concern — not just any chunk of lines — into a new file. Name the new file after what it does, not after what you removed.

**Extract cohesive behavior, not arbitrary line ranges.** A good extraction has:
- A clear, standalone name (`input-buffer.ts`, `footer-format.ts`, not `terminal-ui-helpers.ts`)
- Its own state or a well-defined input/output contract
- No circular dependency on the file it came from (use `import type` if you only need types)

**Consider a subfolder when two or more new files belong together.** If `registry.ts` splits into `registry.ts` + `provider-data.ts`, that may stay flat. If it splits into four files, a `providers/registry/` subfolder keeps the area navigable.

**Do not game the limit.** Collapsing blank lines, removing comments, or inlining short helpers to shrink below 500 is the wrong fix. The limit exists to prompt a structural decision, not a formatting one.

## What not to extract

- Pure configuration data can stay in a data file of any size if it has no logic and is only read, not executed.
- Test files are not checked — `tests/**` is out of scope.
- Generated files are not checked — `dist/**` is out of scope.

## After extracting

1. Create a map page for the new file in `docs/map/` (see `docs/map/README.md` for format).
2. Update the map page for the changed file.
3. Update `docs/map/README.md`'s structure listing.
4. Run `npm test` to confirm the check passes.
