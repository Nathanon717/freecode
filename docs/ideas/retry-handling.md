# Proper retry/wait handling

Parked idea. Today `fetchWithRetry` (`src/providers/adapters/adapter-http-retry.ts`) is one
policy applied to every provider: honor `retry-after` if present, otherwise `2^attempt`
seconds, 5 attempts, then give up. That single policy is wrong for any provider that does
not send `retry-after`, and it ignores rate-limit headers those providers *do* send.

The idea: a defined general fallback, plus per-provider (or per-provider-group) handling
that uses what each provider actually tells us.

## What we measured (26-07-2026, mistral:mistral-medium-2508)

Three full `scripts/diagnostics/map-drift.ts` sweeps — 107 pairs, `--concurrency 8`, one API
key. Diagnostics come from the script's own global-fetch probe (see its `installFetchProbe`);
every report it writes now ends with an "HTTP diagnostics" section.

| run | requests | 429s | terminal 429s (surfaced as errors) |
|-----|---------:|-----:|-----------------------------------:|
| 1   | 246      | 146  | 7  |
| 2   | 253      | 156  | 10 |
| 3   | 263      | 163  | 7  |

Facts established, so nobody re-derives them:

- **Mistral sends no `retry-after`.** 0 of 163 429s carried the header, in every run.
- **Mistral does send its limit**: every 429 carried `x-ratelimit-limit-req-minute: 23` and
  `x-ratelimit-remaining-req-minute: 0`. Confirmed against a live 200 response too:
  `x-ratelimit-limit-req-minute: 23`, `x-ratelimit-limit-tokens-minute: 356250`,
  `x-ratelimit-tokens-query-cost`, `x-max-retry-attempts-reached`. The **requests** bucket is
  the binding one; tokens never came close. Note Mistral only returns `x-ratelimit-*` headers
  on non-streaming responses (see `openai-compat-sse.ts`), which the mistral quirk's
  `forcedNonStream` happens to give us.
- **The invented backoff cannot ride out a per-minute bucket.** 1+2+4+8+16 = **31s** of total
  wait across 5 attempts, versus a bucket that needs up to 60s to refill. Failure is
  structural, not bad luck. `maxWaitMs` (`retryMaxWaitSeconds`, default 120s) never binds at
  these sizes.
- **Retry mostly works.** ~95% of 429s were absorbed and the pair went on to answer. The
  handful of errors are the tail where a worker's first 429 landed early in a minute window.
  But **~62% of all HTTP traffic was collision** — correct-but-wasteful, not correct.
- **Every terminal failure made exactly 6 requests** (1 + 5 retries), never 18. So the AI
  SDK's `maxRetries: 2` never fires on this path: `openai-compat` throws a plain `Error`
  carrying `statusCode`, not an `APICallError`, and the SDK only retries the latter.
  ⚠️ This contradicts defect 3 in `docs/bug log/26-07-2026.md`, which claims the SDK does
  retry it ("up to 18 HTTP requests per pair"). That entry is wrong on this point and should
  be corrected when this work happens.
- **Failures arrive in bursts** — e.g. 60.3s/60.9s, then 125.0s/125.6s, then 191–192s into
  one run. The shared gate parks all 8 workers on the same deadline, so they wake together,
  collide together, and their attempt counters escalate in lockstep. The gate stops the
  *stampede-per-request* problem but creates a *synchronized* one.
- **The real constraint is send rate, not retry budget.** Median successful call latency was
  **2.3s** (max 7.0s). Concurrency 8 offers ~200 req/min against a 23 req/min ceiling — ~9x
  overdrive. Even `--concurrency 1` offers ~26 req/min, still over. **No concurrency setting
  fixes this, and no retry policy fixes it either** — a longer backoff only relocates the
  collision. 107 pairs at 23/min has a ~4.6 min floor; the wasteful run already takes 4m11s,
  so proper pacing costs roughly nothing in wall time and returns zero errors.

## Shape of the fix

Three layers, roughly independent — the first is the real one.

1. **Pace sends from rate-limit headers (per provider).** The limit is on every response
   before we ever hit it. Extend the existing per-provider gate to enforce a minimum spacing
   of `60s / x-ratelimit-limit-req-minute` rather than only reacting to 429s. This is a
   proactive gate, not a retry change, and it generalizes: `src/providers/quota/headers.ts`
   already parses Mistral, Cerebras, and Groq-shaped headers into buckets, and
   `saveObservedRateLimits` already persists the ceilings per model.
2. **Make the fallback bucket-aware.** When a 429 has no `retry-after` but does carry a
   per-minute bucket at 0, wait the *window* (~60s), not `2^attempt`. This is the general
   fallback done properly: prefer `retry-after` → else derive from the exhausted bucket's
   window → else `2^attempt`.
3. **Stagger gate wakeups.** Jitter so N workers don't re-collide on the same instant.
   Cheapest, smallest, and only reduces waste — it does not fix overdrive on its own.

Also worth settling while in here: what a *terminal* rate limit should do. Today it's an
error after 5 attempts. Options are a higher cap, an unbounded wait bounded only by the
caller's `AbortSignal` (the plumbing for this already exists — every wait is abortable), or
keeping the cap but making the error say "rate limited for N minutes" rather than surfacing
a raw HTTP 429 body.

## Per-provider knowledge to gather

Only Mistral has been measured. Before writing per-provider policy, the same probe should be
pointed at each provider to answer: does it send `retry-after`? what rate-limit headers, and
on streaming responses or only non-streaming? which bucket binds (requests or tokens)? what
window (minute / hour / day)? Cerebras is known to expose minute/hour/day buckets and Groq a
dynamic reset window (`headers.ts`), so those two are the obvious next samples.

## Where things live

- `src/providers/adapters/adapter-http-retry.ts` — `fetchWithRetry`, the shared per-provider
  gate, the retry banner sink. All policy lives here.
- `src/providers/quota/headers.ts` — per-provider rate-limit header parsers and bucket
  extraction. Already knows the shapes; nothing feeds them back into retry timing.
- `src/providers/adapters/openai-compat-quirks.ts` — where per-provider behavior is already
  declared (`captureRateLimits`, `parseRateLimitSnapshot`, `httpErrorHint`). The natural home
  for a per-provider retry profile.
- `scripts/diagnostics/map-drift.ts` — the measurement rig. Its HTTP diagnostics section is
  how all of the above was established; reuse it rather than rebuilding one.
- `docs/bug log/26-07-2026.md` — the previous pass on this code (why `retry-after` is honored
  in full, why the gate exists, why waits are abortable). Read before changing policy.
