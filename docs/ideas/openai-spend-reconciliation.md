# Idea: OpenAI spend reconciliation

**Status:** scoped, not implemented - parked thread.

## Problem

Freecode can calculate per-request OpenAI usage cost from the response `usage` payload and
the current local OpenAI pricing table. That is useful immediately after a turn completes,
but it is still a local calculation rather than a reconciliation against OpenAI's account
billing records.

## Future direction

Add a background reconciliation path that compares Freecode's locally recorded OpenAI
request costs with OpenAI usage/cost reporting data. Treat this as account-level or
bucket-level reconciliation, grouped by project/API key/model/time, rather than assuming
OpenAI exposes a stable per-request invoice row.

The UI should keep these labels distinct:

- **Actual usage cost:** calculated locally from the completed response `usage` payload.
- **Reconciled billed spend:** confirmed later from OpenAI cost-reporting data.

## Deferred questions

- Where should per-request local usage records be stored?
- How should reconciliation handle dashboard/reporting lag?
- Which grouping keys are available in the OpenAI cost report for the configured account?
- Should mismatches be shown inline, in diagnostics, or only in a separate spend view?
