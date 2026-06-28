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
- Runs `rg -n --no-heading --hidden --glob=!.git/* [--glob=<include>] -- <pattern> .`
  - Stats unique result files concurrently for `mtime`.
  - Sorts all matches descending by `mtime` (newest files first).
  - Truncates to 100 results with a count header and a truncation notice.
- Returns a plain string with header `Found N matches [...]`, grouped by file, or `No matches found`.

## Notes

`rg` (ripgrep) is bundled as a freecode dependency via the `@vscode/ripgrep` package; the binary is invoked through its exported `rgPath`, so no system `rg` install is required and there is no non-rg fallback. Pattern is passed as a positional argument after `--` to avoid shell-quoting issues; `execFile` is used (not `exec`) to prevent injection.
