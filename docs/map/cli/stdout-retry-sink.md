# src/cli/stdout-retry-sink.ts - Non-TTY Retry Countdown Sink

**Role:** Retry-banner sink for non-TTY sessions. Renders the "retrying in Ns" countdown to stdout. This is the presentation half of the retry flow — the adapter ([adapter-http-retry](../providers/adapters/adapter-http-retry.md)) only emits target times; how (and whether) they are shown belongs to the CLI layer.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createStdoutRetrySink(): (info: RetryBannerInfo | null) => void
```
<!-- END GENERATED EXPORTS -->

## Behavior

Returns a sink closure. On a `RetryBannerInfo`, it writes a `\r`-based live countdown to stdout, refreshed each second via an internal `setInterval`, until the target time elapses ("retrying now...") or the next sink call. On `null` it clears the interval. Each call clears any prior interval, so overlapping waits don't leak timers.

`src/index.ts` registers this as the default retry-banner sink before mode selection; the TTY footer sink and the scripted retry-status-file writer override it when they apply.

## Read When

Changing how retry waits appear in non-TTY / scripted output.
