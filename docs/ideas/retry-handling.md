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

## Provider survey (26-07-2026)

Every free provider with a working key, probed directly with
`npm run rate-limit-probe` (`scripts/diagnostics/rate-limit-probe.ts`). The probe bypasses
the adapter stack on purpose — `fetchWithRetry` would absorb the 429s being measured, and
Mistral's `forcedNonStream` quirk would change what is observed. For each provider it dumps
**every** response header verbatim plus the 429 body, on a 200 non-stream, a 200 stream, a
burst sized off the limit the provider just reported, and then polls every 5s until the
limit clears. Raw per-provider JSON lands in `scripts/diagnostics/rate-limit-probe/`
(gitignored).

Everything below is measured, not documentation-sourced. Model choice matters — limits are
per-model on most of these — so the model probed is named in each row.

| provider | model probed | limits on 200 non-stream | limits on 200 stream | `retry-after` on 429 | headers on 429 | usable hint in 429 body | measured clear time |
|---|---|---|---|---|---|---|---|
| Groq | `llama-3.1-8b-instant` | ✅ full + reset | ✅ full + reset | ✅ `2` | ✅ limits + reset | ✅ RPM + "try again in 2s" | 5s |
| Cerebras | `gemma-4-31b` | ✅ min/hour/day, req+tok | ✅ same | ✅ `57`–`60` (quota kind only) | ❌ none | ✅ kind: `quota` vs `queue` | 11s, 32s |
| GitHub Models | `gpt-4o-mini` | ✅ limit+remaining+**window** | ✅ same | ✅ `55` / `0` | ✅ `x-ratelimit-type`, `-timeremaining` | ✅ names the limit + count | 59s |
| Mistral | `mistral-medium-2508` | ✅ req+tok minute | ❌ **dropped** | ❌ | ✅ limit + remaining=0 | ❌ (`code 1300` only) | 5s, 10s, 52s |
| Cohere | `command-r7b-12-2024` | ⚠️ remaining only | ⚠️ remaining only | ❌ | ❌ none | ✅ "20 API calls / minute" | 58s |
| LLM7 | `codestral-latest` | ❌ | ❌ | ✅ `1` | — | ✅ `retry_after: 1` field | ≤5s |
| Z.ai | `glm-4.5-flash` | ❌ | ❌ | ❌ | ❌ none | ⚠️ `code 1302` only | <5s |
| NVIDIA | `meta/llama-3.1-8b-instruct` | ❌ | ❌ | ❌ | ❌ none | ❌ `{"status":429,"title":"Too Many Requests"}` | 62s |
| OpenRouter | `nvidia/nemotron-nano-9b-v2:free` | ❌ | ❌ | ❌ | ✅ limit + remaining + **absolute reset** | ✅ names limit + scope | 50s |
| Cloudflare | `@cf/…/llama-3.3-70b-…-fast` | ❌ | ❌ | not reached at 60 concurrent | — | — | — |
| Zen (OpenCode) | `deepseek-v4-flash-free` | ❌ | ❌ | not reached at 60 concurrent | — | — | — |
| Hugging Face | `allenai/Olmo-3-7B-Instruct:publicai` | ❌ | ❌ | n/a — **402**, not 429 | ✅ `x-error-message` | ✅ "depleted your monthly included credits" | terminal |
| SiliconFlow | — | key returns 401 `Api key is invalid` — untestable | | | | | |

Three tiers fall out of the "on 200 stream" column, and that column is the one that matters,
because the agent path streams:

- **Paceable** (limit, remaining, and a window are readable *before* the limit is hit, on the
  streaming path): Groq, Cerebras, GitHub Models.
- **Paceable only off-stream**: Mistral. Its `forcedNonStream` quirk, added for unrelated
  reasons, is the only reason we can see its limits at all. Deleting that quirk silently
  deletes the pacing signal.
- **Reactive only** (nothing until the 429, sometimes nothing even then): NVIDIA, Z.ai, LLM7,
  OpenRouter, Cloudflare, Zen, Cohere (a countdown, but no limit or window). This class is
  the entire justification for a well-defined generic mode. Note "reactive" says nothing
  about quality — OpenRouter's 429 is the most precise response in the survey; you just
  cannot see it coming.

### Per-provider detail

**Groq** — the most informative provider, but the informative part is in prose, not headers.
200s carry `x-ratelimit-limit-requests: 14400`, `x-ratelimit-limit-tokens: 6000`,
`remaining-*`, and Go-duration resets (`x-ratelimit-reset-requests: 6s`,
`x-ratelimit-reset-tokens: 370ms`) on **both** stream and non-stream. The trap: the
`limit-requests` bucket is the **daily** one (14400/day), and the binding limit —
**RPM 30** — appears *nowhere in the headers*. It is only in the 429 body:

> Rate limit reached for model `llama-3.1-8b-instant` … on requests per minute (RPM): Limit
> 30, Used 30, Requested 1. **Please try again in 2s.**

The 429 carried `retry-after: 2` and cleared 5s later — precise and short. Note also that
`x-ratelimit-reset-requests` is a *refill* time for the day bucket, not a wait: 14400/day is
one request per 6s, and after the burst consumed 31 requests the header read `3m6s` = 31×6s.
Using it as a wait would be wildly wrong; using it as a **minimum send spacing** is safe and
conservative (6s ≥ the 2s that RPM 30 implies).

**Groq's 413 is a trap.** A prompt larger than the per-minute token bucket returns **413**,
not 429, with `code: "rate_limit_exceeded"` *and* `retry-after: 9`:

> Request too large for model … on tokens per minute (TPM): Limit 6000, Requested 6791,
> please reduce your message size and try again.

No amount of waiting fixes this — the single request exceeds the whole window. We do not
retry 413 today (only 429/503), which is correct by accident. It should stay that way, and
the message deserves a "reduce context" hint rather than a raw HTTP error.

**Cerebras** — the only provider that returns a full bucket set (`requests` and `tokens` ×
`minute`/`hour`/`day`; on this key/model 5 rpm, 150 rph, 2400 rpd) on *both* stream and
non-stream 200s, and **nothing at all** on the 429. So Cerebras must be paced from cached
200 headers; there is no reading the 429 itself.

It also returns **two different 429s**, separable only by the body:

| kind | `param` / `code` | `retry-after` | other |
|---|---|---|---|
| real quota | `quota` / `request_quota_exceeded` | `57`–`60` | — |
| capacity | `queue` / `queue_exceeded` | absent | `x-should-retry: false` |

The capacity one means "the shared queue is full right now" and clears in seconds; treating
it as a rate limit and parking for a minute is the wrong response. Conversely
`x-should-retry: false` is the one machine-readable do-not-retry signal in the whole survey,
and it is attached to the *most* retryable failure of the set — do not wire it to "give up".

Two independent trips cleared in **11s** and **32s** against a `retry-after` of 57–60. The
overshoot is consistent across trials: the header is an upper bound on the window, not a
prediction of when capacity returns. What the underlying mechanism *is* remains unresolved —
5 rpm refilling continuously would free a slot every 12s, which fits the 11s clear but not
the 32s one, and a fixed window would have cleared on the `:00` (it did not: tripped
`16:00:43.336Z`, cleared `16:00:54.803Z`). Treat "wait `overdraft / refill-rate`" as a
hypothesis for Cerebras, not a fitted model, and pace it from its 200 headers instead.

**GitHub Models** — the only provider that states its **window length** in a header:
`x-ratelimit-renewalperiod-requests: 60` (seconds), alongside limit/remaining/reset, on both
stream and non-stream. It also *names which limit tripped*:

| `x-ratelimit-type` | `retry-after` | `x-ratelimit-timeremaining` | body |
|---|---|---|---|
| `UserConcurrentRequests` | `0` | `0` | "Rate limit of 5 per 0s exceeded … Please wait 0 seconds" |
| `UserByMinute` | `55` | `55` | — |

Caveat that generalises: the advertised numbers on 200s (`limit-requests: 20000`,
`limit-tokens: 2000000`) are **not** the binding limits — the real ceilings are 5 concurrent
and an unadvertised per-minute user cap. Pacing purely from advertised header limits would
have sent 20000/min here. Headers say what a provider is willing to admit, not what it
enforces; pacing has to keep reacting to 429s even where it can be proactive.

**Mistral** — headers on non-stream 200s only (`limit-req-minute`, `remaining-req-minute`,
`limit-tokens-minute`, `tokens-query-cost`); the streaming 200 carries only
`x-max-retry-attempts-reached`. The 429 does carry `limit-req-minute: 23` with
`remaining-req-minute: 0` — enough to derive the wait, which is what the original study
concluded. The request ceiling is **per model**: `mistral-medium-2508` is 23/min while
`ministral-3b-2512` is 750/min on the same key, so a per-provider ceiling is the wrong unit.

New this pass: **Mistral's window is a fixed wall-clock minute.** Two timestamped trips both
cleared on the `:00`, not 60s after the 429 — tripped `15:59:48.689Z` → cleared
`16:00:00.802Z`, and tripped `16:07:54.184Z` → cleared `16:08:00.641Z` (poll granularity is
5s, so "on the boundary" is accurate to ±5s). A third, untimestamped trial cleared 52s after
its 429, consistent with tripping early in a minute. So the correct wait is
`60s − (now mod 60s)`: 12s, 7s and 52s for the three trials instead of a flat 60s each.

**Cohere** — no limit and no window anywhere, but 200s carry
`x-trial-endpoint-call-remaining` counting down (19, 18, …). The full burst traces it end to
end: it fell 19 → 0 across exactly 20 successful calls, the 429s begin precisely at 0, and
the header is **absent on 429s** — so it is a reliable pre-emptive signal ("at 0, stop
sending") and useless as a reactive one. The 429 itself has **no headers at all** and the
only statement of the limit is English prose in the body — "You are using a Trial key, which
is limited to 20 API calls / minute".

Cleared at 58s, and the clearing response read `remaining: 1`, not 19 — capacity comes back
a slot at a time as old calls age out, so this is a **rolling** window, not a fixed one. A
worker that waits the full window and then resumes at full speed will re-trip immediately;
one that reads the counter will not.

**LLM7** — nothing on 200s, but the 429 is well-formed: `retry-after: 1` *and* a
`retry_after: 1` field inside the JSON body, with the message "Rate limit exceeded. Retry
after 1 seconds." Cleared within the 5s poll granularity. Short, precise, honest.

**Z.ai** — no headers anywhere; 429 body is `{"error":{"code":"1302","message":"Rate limit
reached for requests"}}`. 18 of 20 concurrent requests 429'd, yet the *next single* request
immediately succeeded and the poll cleared inside 5s. That is a **concurrency cap, not a
window**: the right response is a near-immediate retry (and a concurrency semaphore), and
today's 2^attempt escalation is pure waste here.

**NVIDIA** — the worst case, and the one the generic mode has to serve. Nothing on 200s.
25 concurrent requests never tripped; 60 did. The 429 is
`{"status":429,"title":"Too Many Requests"}` with no rate-limit headers and no `retry-after`.
Cleared at 62s — a minute-scale window that today's 31s budget cannot ride out.

**OpenRouter** — nothing on 200s (stream or not), and it took a 60-wide burst to trip at all
(32 was not enough). But its 429 is **the most precise response in the survey**:

```
x-ratelimit-limit: 50   x-ratelimit-remaining: 0   x-ratelimit-reset: 1785082980000
```

`x-ratelimit-reset` is an **absolute epoch in milliseconds** — not a duration to be re-based
against clock skew, not an estimate. Verified: it read `16:23:00.000Z` and the limit cleared
at `16:23:00.938Z`, i.e. accurate to under a second, and it lands on the wall-clock minute
(another fixed-window provider). Nothing else measured comes closer. The body names the
limit and its scope, and helpfully **repeats the headers inside `metadata.headers`** for
cases where a proxy strips them:

> Rate limit exceeded: `limit_rpm/nvidia/nemotron-nano-9b-v2/71549a70-…`. High demand for
> nvidia/nemotron-nano-9b-v2:free on OpenRouter — limited to **50 requests per minute**.

So the limit is per *model*, not per key, and it is a "high demand" free-pool limit that can
move — one more reason to read it from the response rather than hard-code it.

It also has the survey's only **read-only quota endpoint**, `GET /api/v1/key`, which costs
no inference:

```json
{"limit":1,"limit_remaining":0.999104448,"limit_reset":"monthly","usage":0.001242252,
 "usage_daily":0,"usage_weekly":0,"usage_monthly":0.000895552,"is_free_tier":false,
 "rate_limit":{"requests":-1,"interval":"10s","note":"This field is deprecated and safe to ignore."}}
```

Two caveats found by measuring rather than reading: `rate_limit` is self-declared deprecated
and returns `-1`, and `usage_daily` stayed at **0 across ~58 free-model calls** because free
models cost $0. So `/key` is a *credit-budget* signal (useful for "this key is out of
money", `is_free_tier`, monthly reset) and tells you nothing about the free-model request
cap. Worth reading at startup; not a pacing input.

**Cloudflare** — nothing on 200s and no 429 at 60 concurrent, ~85 requests total. That is not
"no limits": the free tier is metered as a **daily neuron budget** rather than a request
rate, so the failure mode is a day-scale wall that a burst cannot reach and this probe cannot
characterise. Its 429/quota-exhausted shape is **unknown**; assume nothing. Characterising it
needs either a deliberate day-budget burn or a read of the account's neuron usage via
Cloudflare's analytics API — the latter would be a second read-only quota endpoint, worth
having.

**Zen (OpenCode)** — **keyless**: the registry sets `defaultApiKey: "public"`, so quota is
per **IP**, not per key (see `docs/providers.md`). Nothing on 200s and no 429 across 62
requests at 60 concurrent, so its limit shape is likewise **unknown**. The per-IP quota makes
it the one provider where a shared egress means someone else's traffic can exhaust *your*
budget, and where rotating credentials is not a remedy — worth remembering when its failures
eventually get characterised.

⚠️ The first pass of this survey wrongly recorded Zen as "no API key — untested", because the
probe gated on `process.env[apiKeyEnvVar]` instead of the `defaultApiKey` fallback that
`resolveApiKey()` applies. Any future tooling that asks "is this provider usable?" must go
through `resolveApiKey()`.

**Hugging Face** — the exhaustion signal is **402, not 429**: the key's monthly credits ran
out *mid-probe*, 9 requests succeeded and the next 13 returned `402` carrying the reason in a
header,
`x-error-message: You have depleted your monthly included credits…`. Terminal — no retry
policy helps, and treating it as a rate limit would burn the retry budget for nothing. This
argues for a distinct "provider out of credit" outcome that disables the provider for the
session instead of retrying it. (Those credits are now spent for the month, so a re-probe
will 402 from the first request — that is the key's state, not HF's behaviour.)

**SiliconFlow** — the stored key returns `401 Api key is invalid` on both `/user/info` and
`/models`. Nothing measurable until the key is replaced.

## Signals better than blind waiting

Ordered by how much they beat `2^attempt`, all of them observed above:

1. **A read-only quota endpoint.** OpenRouter's `/key`. Zero inference cost, readable at
   startup, tells you the key is dead or out of credit *before* the first call. SiliconFlow
   has `/user/info` (untested — invalid key).
2. **An absolute reset timestamp.** OpenRouter's `x-ratelimit-reset` (epoch ms), verified
   accurate to under a second. Strictly better than a duration: it survives request latency,
   it is not re-based against our clock on arrival, and N workers computing a wake-up from it
   all get the *same* instant rather than N drifting ones. Anthropic's ISO-8601 resets are
   the same idea (`headers.ts` already converts them to durations at parse time — for retry
   timing, keep the absolute form).
3. **`retry-after`.** Groq, Cerebras (quota kind), GitHub, LLM7. Already honored.
4. **A named limit *kind*.** GitHub's `x-ratelimit-type` and Cerebras's body `param`/`code`
   split "you are over quota" (wait the window) from "too many at once / server busy" (retry
   in ~1s, and cap concurrency). Nothing in the current code distinguishes these, and they
   want opposite responses. Z.ai's sub-5s clear puts it in the second class too, inferred
   from behaviour rather than a label.
5. **The window length, explicitly.** GitHub's `x-ratelimit-renewalperiod-requests: 60`.
   With limit + remaining + window you can pace exactly and never 429 at all.
6. **Prose in the 429 body.** Groq: "on requests per minute (RPM): Limit 30, Used 30" plus
   "Please try again in 2s" — the *only* place Groq states its binding limit. Cohere: "20 API
   calls / minute" — the only place Cohere states any limit. Both are stable enough to parse
   with a narrow regex, and both are strictly better than guessing. Parse defensively: a
   miss must fall through to the next rung, never throw.
7. **A JSON `retry_after` field.** LLM7 puts it in the body alongside the header.
8. **A remaining-count with no limit and no window.** Cohere's
   `x-trial-endpoint-call-remaining`. Enough to stop *before* the 429 even though you cannot
   compute a rate from it.
9. **Cached ceilings from earlier 200s.** Required for Cerebras, whose 429s carry nothing but
   whose 200s carry everything. `saveObservedRateLimits` already persists exactly this.
10. **Our own measured clear time.** Every 429 → success transition is a measurement of the
   real window — precisely what this probe did. Persisting an EWMA of it per provider+model
   converts the no-signal providers (NVIDIA, Z.ai) into paced ones after a single incident.
   This is the highest-value item for the reactive-only tier, and it needs no cooperation
   from the provider.
11. **The window's phase, not just its length.** Mistral clears on the wall-clock minute, so
    the wait is to the boundary (7s and 12s in the two timestamped trials) rather than a flat
    60s. Cohere's counter shows the opposite shape — a rolling window returning one slot at a
    time — and Groq's reset headers describe a continuously refilling bucket. Same nominal
    minute, three different arithmetics; guessing the wrong one costs either an error or ~50s
    per incident.

Also worth knowing, because they are failures no retry can fix: Groq's **413** (single
request exceeds the token window → shrink the request), Hugging Face's **402** (credits
gone → drop the provider), and SiliconFlow's **401** (bad key → drop the provider).

## Proposal: the generic / fallback mode

For any provider with no usable signal — NVIDIA, Z.ai, Cohere-on-429, Mistral-on-stream,
Cloudflare and Zen (both uncharacterised), and any provider added tomorrow — the policy
should be built around what
the measured clear times actually look like. There are two distinct failure *causes*, and
the second one has no characteristic duration at all:

- **Concurrency / queue failures clear in seconds** — Z.ai <5s, LLM7 ≤5s, Groq 5s. Too many
  in flight or a busy queue; nothing has to refill.
- **Quota failures clear anywhere in the window**, decided by where in it you happened to
  land, not by which provider you are talking to. Mistral alone produced 5s, 10s and 52s on
  the same key and model. Cerebras produced 11s and 32s. Cohere 58s, GitHub 59s, NVIDIA 62s.

So the useful split is by *cause*, and within the quota class the wait is a **phase**
problem, not a magnitude one. That kills the exponential ramp twice over: it is too slow for
the seconds-scale class, and for the quota class it converges on a number (31s) that is
neither the boundary nor the window — today's ladder gives up before a minute-window
provider can clear at all, no matter how it is tuned, because 1+2+4+8+16 = 31s < 60s.

**Generic ladder** — probe the fast cause twice, then commit to the window:

| attempt | wait | serves |
|---|---|---|
| 1 | 1s | concurrency caps, queue-full (Z.ai, Cerebras `queue`, GitHub `UserConcurrentRequests`) |
| 2 | 2s | short buckets (LLM7, Groq RPM) |
| 3 | to the next minute boundary, min 15s | fixed-window providers (Mistral) |
| 4 | 30s | rolling windows, where capacity returns gradually (Cohere, NVIDIA) |
| 5 | 60s | hour-scale, or a window we have mis-modelled |

108s worst case against today's 31s, and the first two rungs cost the same 3s that today's
first two do — nothing gets slower for the fast class. Every wait jittered ±20% so N workers
released from the shared gate do not re-collide, which is the synchronised-burst failure the
original study found. Then:

- **Learn from the outcome.** See "Learned clear time" below.
- **Terminal means terminal, and says so.** After the ladder, surface "rate limited by
  {provider} for {N}s — {model} allows {limit}/{window}" rather than a raw HTTP 429 body.
  The unbounded-wait option is the wrong default: the caller's `AbortSignal` already bounds
  every wait, but an agent silently parked for 20 minutes is worse than an error that says
  to switch models.
- **Never retry the unretryable.** 402/401/413 exit immediately with the provider's own
  explanation (`x-error-message` for HF, the TPM prose for Groq). 402 and 401 should
  additionally disable the provider for the session — every subsequent call is a guaranteed
  failure.
- **Classify before waiting.** If `retry-after ≤ 1`, or the body/type names concurrency or a
  queue (`queue_exceeded`, `UserConcurrentRequests`, Z.ai `1302`), it is a concurrency
  failure: retry in ~1s and lower the provider's in-flight cap by one, rather than parking
  the whole provider on a gate. Parking is right for quota, wrong for concurrency —
  it converts a 1s stall into a 60s one.

**Per-provider resolution ladder** (each rung falls through to the next on a miss, ending in
the generic ladder above):

1. An absolute reset timestamp — OpenRouter's `x-ratelimit-reset` (epoch ms). Wake at that
   instant; it needs no arithmetic and no clock-skew allowance.
2. `retry-after` header — but treat `0` as "immediately", and treat a value that overshoots
   the learned clear time by >3x (Cerebras: 57–60 advertised vs 11–32 measured) as an upper
   bound worth re-probing before, not a floor to sleep out in full.
3. A provider-specific reset for the *exhausted* bucket — GitHub's `x-ratelimit-timeremaining`.
   Not Groq's `x-ratelimit-reset-requests`, which describes a different (daily) bucket than
   the one that failed.
4. A `retry_after` field in the body (LLM7), or a parsed prose hint ("try again in 2s",
   "Please wait 0 seconds"). OpenRouter also mirrors its headers into `metadata.headers`,
   which is the fallback when something upstream strips them.
5. Exhausted bucket + known window: `remaining == 0` plus a window from
   `renewalperiod` (GitHub), a header suffix (`-minute`/`-hour`/`-day`, Cerebras/Mistral), or
   a per-provider constant. Wait to the boundary for fixed-window providers (Mistral,
   OpenRouter), `overdraft / refill-rate` for refilling buckets (Groq), and re-probe gradually
   for rolling ones (Cohere). Cerebras fits none of the three cleanly — pace it, do not model
   it.
6. Cached ceilings from earlier 200s (`saveObservedRateLimits`) — the only option for
   Cerebras, whose 429s are bare.
7. The learned EWMA clear time (below).
8. The generic ladder.

### Learned clear time

The probe's most reusable trick is one the agent can run for free, forever: **every 429 → 200
transition is a measurement of the real window.** The probe learned NVIDIA's ~62s and Z.ai's
<5s from providers that state nothing, using no privileged information — just the timestamp
of the first 429 and the timestamp of the first success after it. Nothing stops
`fetchWithRetry` from recording the same thing, and doing so converts the whole reactive-only
tier from "guess" into "measured" after a single incident.

Concretely:

- **Key it by `(providerId, modelId)`, not provider.** Mistral's own numbers make the case:
  23/min for `mistral-medium-2508`, 750/min for `ministral-3b-2512`, same key. A
  provider-level average would be wrong for both. OpenRouter's 429 body confirms the same
  shape from the other side — `limit_rpm/nvidia/nemotron-nano-9b-v2/…` is scoped to a model.
- **Record only clean observations.** The measurement is `firstSuccessAt − first429At` for one
  provider+model, and it is only meaningful when *our own* waiting is what ended it. Discard
  the sample if the caller aborted, if the gate held us past the clear time (we would be
  measuring our own gate, not the provider), or if a different model interleaved on the same
  key.
- **EWMA, not mean**, with a small α (~0.3): limits change, free tiers get re-tiered, and
  OpenRouter's "high demand … limited to 50/min" is explicitly a moving number. An EWMA
  forgets an old ceiling in a few incidents; a lifetime mean never does.
- **Store both the value and its spread.** Mistral produced 5s, 10s and 52s for one model —
  not noise, but *phase*: the same 60s window entered at different points. A learned mean of
  ~22s would be wrong every single time. So keep `max` alongside the EWMA and treat the
  spread as the tell: **a wide spread means a fixed window** (wait to the boundary), **a tight
  one means a short bucket or a concurrency cap** (retry fast). This is the piece that makes
  the learned value actionable rather than merely descriptive.
- **Use it as the ladder's starting rung**, not as a hard sleep. On the next signal-free 429,
  start at the learned value (floored at 1s, capped at the generic ladder's total) and
  continue down the remaining rungs if it misses. Being wrong then costs one extra probe, not
  an error.
- **Persist it next to the observed ceilings.** `saveObservedRateLimits` already writes
  per-model limit data, so the storage and the lookup path exist; this adds a second field to
  the same record rather than a new subsystem. Surviving restarts is most of the value — the
  first 429 of a session is exactly when there is no in-memory history.
- **It also audits the providers that do talk.** Cerebras advertises `retry-after: 57–60` and
  clears in 11–32s; the learned value is what proves that, and what would justify re-probing
  early instead of sleeping out a header we can measure as over-cautious. Same mechanism,
  applied to a provider that has a signal, catches the signal being wrong.

The one thing it cannot do is prevent the *first* 429 for a provider that says nothing —
that needs pacing, which needs a ceiling, which those providers do not give. Learned clear
time is the best available answer for that tier, not a substitute for pacing where pacing is
possible.

**Proactive pacing, which is the actual fix** (unchanged from the original conclusion, now
with three more providers that support it): for Groq, Cerebras, GitHub, and Mistral the
ceiling is readable before it is hit. Enforce a minimum send spacing of `window / limit` per
provider **and model** — per-model matters, `mistral-medium-2508` is 23/min while
`ministral-3b-2512` is 750/min — and the 429 stops happening at all. Cerebras at 5 rpm is
the extreme case: no retry policy can make 8 concurrent workers work against 5 requests per
minute, only pacing can. Keep reacting to 429s anyway, because GitHub proves advertised
limits can be off by orders of magnitude.

## Where things live

- `src/providers/adapters/adapter-http-retry.ts` — `fetchWithRetry`, the shared per-provider
  gate, the retry banner sink. All policy lives here.
- `src/providers/quota/headers.ts` — per-provider rate-limit header parsers and bucket
  extraction. Already knows the Groq/Mistral/Cerebras shapes; nothing feeds them back into
  retry timing. GitHub's `renewalperiod`/`type` and Cohere's trial countdown are not parsed
  yet.
- `src/providers/adapters/openai-compat-quirks.ts` — where per-provider behavior is already
  declared (`captureRateLimits`, `parseRateLimitSnapshot`, `httpErrorHint`). The natural home
  for a per-provider retry profile. Note `mistral.transformRequest`'s `forcedNonStream` is
  load-bearing for rate-limit visibility, not just for output correctness.
- `scripts/diagnostics/rate-limit-probe.ts` (`npm run rate-limit-probe`) — the rig behind the
  provider survey. `--only`, `--model`, `--burst`, `--no-burst`, `--recover-budget`. Dumps
  every header and the 429 body per provider to `scripts/diagnostics/rate-limit-probe/`.
  Re-run it when adding a provider or when a limit is suspected to have changed.
- `scripts/sweep/http-probe.ts` — the concurrency/waste measurement, now shared by every
  sweep (`npm run map-drift` is one; see `docs/sweeps.md`). Its HTTP diagnostics section
  established the Mistral study above; it is Mistral-header-shaped by design, so use
  `rate-limit-probe` for anything cross-provider.
- `docs/bug log/26-07-2026.md` — the previous pass on this code (why `retry-after` is honored
  in full, why the gate exists, why waits are abortable). Read before changing policy.
