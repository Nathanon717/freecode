# Session Log — 2026-05-25: HTML Error Response Detection

## Change

**File:** `src/util/errors.ts` — lines 100–103  
**Inspired by:** OpenCode `src/util/errors.ts:87-106`

## Problem

When an API call fails and the server returns an HTML response (e.g. from a misconfigured reverse proxy, expired API key routed through a gateway, or network interception), `toDetailedErrorMessage` was dumping the raw HTML body into the terminal output. This is unreadable noise.

## Fix

Added an HTML detection guard before the generic `response body: ${body}` fallback. If the response body starts with `<` (after trimming leading whitespace), the raw dump is suppressed and replaced with a human-readable hint:

```
response body is HTML — likely a gateway/proxy error (check API key or network config)
```

The `else if` structure preserves the existing behaviour for all non-HTML bodies.

```diff
-    if (body && !details && body !== baseMessage) detailLines.push(`response body: ${body}`);
+    if (body && body.trimStart().startsWith('<')) {
+      detailLines.push('response body is HTML — likely a gateway/proxy error (check API key or network config)');
+    } else if (body && !details && body !== baseMessage) {
+      detailLines.push(`response body: ${body}`);
+    }
```

## Scope

Single-line logic change. No new dependencies, no API surface changes, no test infrastructure changes required.
