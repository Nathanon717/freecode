# src/cli/footer-status.ts - Footer Status State and Formatters

**Role:** Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.

## Exports

Type:

- `PreflightInputCost` — snapshot type for OpenAI input token/cost estimates

State setters:

- `setTokenCount(n)` — context token count shown as `N ctx`
- `setQuotaSnapshot(quota | null)` — Groq rate-limit headers; refill is estimated each second
- `setModelStatus(providerId, modelId)` — shown as `provider:model`
- `setPreflightInputCost(snapshot)` — OpenAI preflight cost snapshot
- `setOpenAIDailySpend(snapshot)` — OpenAI daily spend snapshot
- `setRetryBanner(info | null)` — rate-limit countdown; `info` has `{ name, label, targetMs }`

Formatting / layout:

- `formatEvalRunStatus(now?)` — returns retry-banner string for footer left side
- `layoutFooterRightRows(width, rowBudget, now?)` — lays out right-side footer content into 1–3 rows; `result[0]` = bottom row
- `composeBottomRightStatus(width, now?)` — single-row right status string
- `composeBottomStatusLine(width, now?)` — right-aligned full-width status line

## Read when

Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.

## Key neighbors

- `cli/terminal-ui.ts` — imports `layoutFooterRightRows` and `formatEvalRunStatus` for `composeFooterOutput`; re-exports everything for backwards-compat callers
- `cli/openai-daily-spend.ts` — imports `OpenAIDailySpend` type
- `providers/quota/headers.ts` — imports `RateLimitSnapshot` type
