# src/cli/terminal-ui.ts - Bottom Terminal UI

**Role:** Maintains the bottom-pinned prompt/status area used by interactive mode.

## Exports

State setters/getters:

- `isBottomUIActive()`
- `getInputBuffer()`, `setInputBuffer()`, `appendToInputBuffer()`, `backspaceInputBuffer()`
- `setTokenCount()`
- `setQuotaSnapshot()`
- `setModelStatus()`
- `setSuggestions()`
- `setInlineCompletion()`

Rendering/control:

- `composeBottomRightStatus()`
- `composeBottomStatusLine()`
- `getInlineCompletionSuffix()`
- `drawBottomUI()`
- `parkCursorInScrollRegion()`
- `setupBottomUI()`
- `teardownBottomUI()`
- `resetSubmittedInputArea()`

## Layout

The module uses ANSI scroll-region controls so normal output scrolls above the reserved bottom rows. Reserved rows are:

```text
2 + suggestion_count
```

The input row shows the prompt and inline completion. The status row right-aligns model/quota/token information.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Cleanup

Resize and process-exit handlers restore the scroll region or redraw the bottom UI as needed.
