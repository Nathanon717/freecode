# src/agent/tools/grep.ts - grep Tool

**Role:** Searches files using ripgrep (`rg`), which is a required freecode dependency. Results are sorted by file modification time (newest first) so recently-changed code surfaces first.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
grepTool: CoreTool<z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; include: z.ZodOptional<z.ZodString>; }, 'strip', z.ZodTypeAny, { pattern: string; path?: string | undefined; include?: string | undefined; }, { pattern: string; path?: string | undefined; include?: string | undefined; }>, string> & { execute: (args: { pattern: string; path?: string | undefined; include?: string | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pattern` | `string` | required | Regex pattern to search for. |
| `path` | `string` | `.` | Directory resolved through `resolveProjectPath()` and used as the search root. |
| `include` | `string` | — | Optional glob filter passed to rg `--glob` (e.g. `"*.ts"`). |

## Behavior

- Rejects absolute paths and `..` escapes outside the project root.
- Runs `rg -n --no-heading --hidden --no-require-git --glob=!.git/* [--glob=<include>] -- <pattern> .`
  - `--no-require-git` makes `.gitignore` apply in trees that have one but no `.git`
    (exported source drops, worktree subdirectories). Without it rg silently walks
    `node_modules`/`bin`/`obj`/`.vs` there, inflating both cost and noise.
    Note this ungates *all* git ignore sources, including the user's global
    `core.excludesFile` (`~/.config/git/ignore`) — so in a non-git tree grep now also
    skips paths matched by rules the user did not write into that tree. `.ignore` and
    `.rgignore` were always honored and are unaffected.
  - Stats unique result files concurrently for `mtime`.
  - Sorts all matches descending by `mtime` (newest files first).
  - Truncates to 100 results with a count header and a truncation notice.
- Returns a plain string with header `Found N matches [...]`, grouped by file, or `No matches found`.

## Failure modes

`rg` only ever exits 0/1/2, but `execFile` can also reject without an exit code at
all, and `--no-messages` blanks stderr — so those rejections carry no usable detail.
Each is mapped to an actionable message rather than rethrown:

| Rejection | `err` shape | Returned |
|-----------|-------------|----------|
| Timeout (`TIMEOUT_MS`, 10s) | `code: null`, `signal: 'SIGTERM'`, `killed: true` | `Search timed out after 10s. Narrow it with ...` |
| Output over `MAX_BUFFER` (10MB) | `code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'` | `Search produced more than 10MB of output. Narrow it with ...` |
| Exit 1 (no matches) | `code: 1` | `No matches found` |
| Exit 2 (some paths unreadable) | `code: 2` | Partial results from `err.stdout` |

The non-exit-code cases are checked **before** the exit-code ladder. Exit 2 is a
success path: locked or permission-denied files (common under Windows with an IDE
holding `.vs` open) still yield every other match.

A large tree can still exhaust the 10s timeout even with `--no-require-git`; the
message names the fix (narrow `path`, add `include`) rather than stalling longer.

## Notes

`rg` (ripgrep) is bundled as a freecode dependency via the `@vscode/ripgrep` package; the binary is invoked through its exported `rgPath`, so no system `rg` install is required and there is no non-rg fallback. Pattern is passed as a positional argument after `--` to avoid shell-quoting issues; `execFile` is used (not `exec`) to prevent injection.
