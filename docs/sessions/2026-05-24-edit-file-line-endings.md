# Edit File Line Endings

## What changed

- Updated `edit_file` so replacements run against LF-normalized text and the final write preserves the file's original LF or CRLF style.
- Added regression coverage for editing a CRLF file with LF-style tool input.
- Updated the edit tool map page to reflect the line-ending preservation behavior.

## Key decisions

- Detect line endings from the original file content with CRLF preferred when present.
- Normalize `old_text`, `new_text`, and file content to LF before searching, so Windows files can still be edited with normal tool newlines.
- Convert the updated result back to CRLF only when the source file used CRLF.

## Files changed

- `src/agent/tools/edit-file.ts`
- `tests/tool-integration.test.ts`
- `docs/map/agent/tools/edit-file.md`

## Verification

- `npm.cmd run build`
- `npm.cmd test`
