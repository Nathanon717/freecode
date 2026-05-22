# src/cli/terminal-ui.ts - Bottom Terminal UI

**Role:** Maintains the bottom-pinned prompt/status area used by interactive mode.

## Exports

State setters/getters:

- `isBottomUIActive()`
- `getInputBuffer()`, `setInputBuffer()`, `appendToInputBuffer()`, `backspaceInputBuffer()`
- `setTokenCount()`
- `setQuotaSnapshot()`
- `setModelStatus()`
- `setPreflightInputCost()`
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

The input row shows the prompt and inline completion. The status row right-aligns model, OpenAI preflight input cost, quota, and context-token information.

## Preflight Input Cost

`setPreflightInputCost()` accepts a `PreflightInputCost` snapshot from `preflight-input-cost.ts`. Only `ready` snapshots are rendered, formatted as exact input tokens plus input-token cost, for example `12,431 in tok | $0.0186 input`.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Cleanup

Resize and process-exit handlers restore the scroll region or redraw the bottom UI as needed.
