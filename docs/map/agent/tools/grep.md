# src/agent/tools/grep.ts - grep Tool

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Searches files using ripgrep (`rg`), which is a required freecode dependency. Results are sorted by file modification time (newest first) so recently-changed code surfaces first.

## Read When

- Changing how grep results sort by file modification time so recently-changed files surface first.
- Debugging the timeout, max-buffer, and exit-code-2 failure messages returned to the agent.
- Extending the content/context-line rendering or the count and files_with_matches output formats.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
grepTool: CoreTool<z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; include: z.ZodOptional<z.ZodString>; output_mode: z.ZodOptional<z.ZodEnum<['content', 'files_with_matches', 'count']>>; case_insensitive: z.ZodOptional<z.ZodBoolean>; context_lines: z.ZodOptional<z.ZodNumber>; multiline: z.ZodOptional<z.ZodBoolean>; head_limit: z.ZodOptional<z.ZodNumber>; }, 'strip', z.ZodTypeAny, { pattern: string; path?: string | undefined; include?: string | undefined; output_mode?: 'content' | 'files_with_matches' | 'count' | undefined; case_insensitive?: boolean | undefined; context_lines?: number | undefined; multiline?: boolean | undefined; head_limit?: number | undefined; }, { pattern: string; path?: string | undefined; include?: string | undefined; output_mode?: 'content' | 'files_with_matches' | 'count' | undefined; case_insensitive?: boolean | undefined; context_lines?: number | undefined; multiline?: boolean | undefined; head_limit?: number | undefined; }>, string> & { execute: (args: { pattern: string; path?: string | undefined; include?: string | undefined; output_mode?: 'content' | 'files_with_matches' | 'count' | undefined; case_insensitive?: boolean | undefined; context_lines?: number | undefined; multiline?: boolean | undefined; head_limit?: number | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/workspace.ts`](../workspace.md) ×1
- **Imported by:** [`agent/tools/index.ts`](index.md) ×1

## Tests

`tests/agent/tools/grep.test.ts`. 2 other test files reference it.

## Budget

323 / 500 lines (177 to spare).
<!-- END GENERATED MAP FACTS -->

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pattern` | `string` | required | Regex pattern to search for. |
| `path` | `string` | `.` | File **or** directory, resolved through `resolveExistingProjectPath()`. |
| `include` | `string` | — | Glob filter passed to rg `--glob` (e.g. `"*.ts"`, `"*.{ts,tsx}"`). |
| `output_mode` | `'content' \| 'files_with_matches' \| 'count'` | `content` | Shape of the result: matching lines, matching paths, or a per-file tally. |
| `case_insensitive` | `boolean` | `false` | Adds `-i`. |
| `context_lines` | `number` | `0` | Lines around each match (`--context`), clamped to `0..MAX_CONTEXT_LINES` (20). Content mode only. |
| `multiline` | `boolean` | `false` | Adds `--multiline --multiline-dotall`, letting the pattern span newlines with `.` matching them. |
| `head_limit` | `number` | `RESULT_LIMIT` (100) | Result cap, clamped to `1..MAX_RESULT_LIMIT` (1000). |

Numeric params are `Math.trunc`ed then clamped, so an out-of-range value from a
model degrades to the nearest legal one rather than erroring.

## Behavior

- Rejects absolute paths and `..` escapes outside the project root.
- `path` is stat'ed to decide the search root: a directory becomes rg's `cwd` with target
  `.`; a **file** becomes `cwd = dirname` with target `basename`, so the file's own name
  still reaches the glob filter. rg is always invoked from a directory either way.
- Runs `rg --hidden --no-require-git --glob=!.git/* --no-messages --null --with-filename <mode flags> [--context=N] [-i] [--multiline --multiline-dotall] [--glob=<include>] -- <pattern> <target>`
  - `--no-require-git` makes `.gitignore` apply in trees that have one but no `.git`
    (exported source drops, worktree subdirectories). Without it rg silently walks
    `node_modules`/`bin`/`obj`/`.vs` there, inflating both cost and noise.
    Note this ungates *all* git ignore sources, including the user's global
    `core.excludesFile` (`~/.config/git/ignore`) — so in a non-git tree grep now also
    skips paths matched by rules the user did not write into that tree. `.ignore` and
    `.rgignore` were always honored and are unaffected.
  - `--with-filename` is mandatory, not cosmetic: rg **omits** the path when given a single
    file as its target, which would leave file-mode results unattributable.
- Stats the unique result files concurrently for `mtime` and sorts descending (newest
  first) in every mode. The sort is only applied to sequences rg already grouped by file,
  so JS sort stability preserves line order within each file.

### Output parsing

`--null` makes rg separate the path from the rest of the row with a NUL instead of `:`.
This is load-bearing in three ways:

- A **filename containing `:`** parses correctly. The previous `indexOf(':')` split
  mis-attributed those rows.
- **Match vs. context** stays distinguishable: after the NUL, `<line>:<text>` is a match
  and `<line>-<text>` is a context line.
- rg's bare `--` context-group dividers carry no NUL and are dropped; the renderer
  re-derives group breaks from gaps in the line numbers instead.

Multiline matches need no special handling — rg prefixes *every* line of a multiline
match with `path\0<line>:`, so there are no unprefixed continuation rows to reassemble.

### Result shapes

| Mode | rg flag | Rendered as |
|------|---------|-------------|
| `content` | `-n --no-heading` | `Found N matches in M files`, then per file `  Line 42: text` for matches and `  Line 41- text` for context, with `  --` marking a gap inside a file |
| `files_with_matches` | `--files-with-matches` | `Found N files with matches`, then one path per line |
| `count` | `--count` | `Found N matches in M files`, then `path: count` per line |

All modes return `No matches found` when empty, cap output at the effective limit, and
append the same `(Results truncated: ...)` notice when they do. In content mode the cap
counts **matches only** — requesting context never costs you results. Individual lines
over `MAX_LINE_LENGTH` (2000) are clipped with `...`.

Both header figures are always whole-result totals, never post-cap ones; `(showing first
N)` plus the truncation notice describe what actually reached the body.

`head_limit` is a **display** cap applied after rg returns — it is never passed to rg, so
it changes neither the work rg does nor the `TIMEOUT_MS`/`MAX_BUFFER` exposure. Raising it
to `MAX_RESULT_LIMIT` is free in that sense: measured on this repo, the broadest possible
search (`pattern: "e"`, `include: "*.ts"`) yields 26,139 matches / 2.4 MB in ~0.2s, so
1000 results is comfortably reachable rather than a nominal ceiling.

`--multiline` is passed in every output mode, and `--count` stays coherent under it: rg
counts one multi-line match as `1`, not as one per line spanned, which is what the
`Found N matches` header claims.

## Failure modes

`rg` only ever exits 0/1/2, but `execFile` can also reject without an exit code at
all, and `--no-messages` blanks stderr for I/O errors — so those rejections carry no
usable detail. Each is mapped to an actionable message rather than rethrown:

| Rejection | `err` shape | Returned |
|-----------|-------------|----------|
| Timeout (`TIMEOUT_MS`, 10s) | `code: null`, `signal: 'SIGTERM'`, `killed: true` | `Search timed out after 10s. Narrow it with ...` |
| Output over `MAX_BUFFER` (10MB) | `code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'` | `Search produced more than 10MB of output. Narrow it with ...` |
| Exit 1 (no matches) | `code: 1` | `No matches found` |
| Exit 2 **with** stdout (some paths unreadable) | `code: 2` | Partial results from `err.stdout` |
| Exit 2 **without** stdout, with stderr (usage error) | `code: 2` | `Search failed: <first 3 stderr lines>` |

The non-exit-code cases are checked **before** the exit-code ladder.

Exit 2 is overloaded and the split above matters. It covers both *partial success*
(locked or permission-denied files — common on Windows with an IDE holding `.vs` open —
where every other match still comes back) and *total failure* (a malformed regex, e.g.
`foo(`). `--no-messages` suppresses only the former's warnings, so stderr with no stdout
is a real failure; reporting it as `No matches found` would hand back a confident wrong
answer for a typo'd pattern.

A large tree can still exhaust the 10s timeout even with `--no-require-git`; the
message names the fix (narrow `path`, add `include`) rather than stalling longer.

## Notes

`rg` (ripgrep) is bundled as a freecode dependency via the `@vscode/ripgrep` package; the binary is invoked through its exported `rgPath`, so no system `rg` install is required and there is no non-rg fallback. Pattern is passed as a positional argument after `--` to avoid shell-quoting issues; `execFile` is used (not `exec`) to prevent injection.

The parameter list is mirrored in three places that must be updated together:
`TOOL_PARAMS` in `src/cli/tools/tool-invocation.ts` (hand-typed-call autofill, guarded by a
drift test in `tests/cli/tools/tool-runner.test.ts`), the tool reference in
`src/agent/parsed-tools.ts` (prompt-based tool calling), and the `/tools` signature
asserted in `tests/e2e/tools-list.e2e.json`.
