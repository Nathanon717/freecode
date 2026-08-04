// The sweep engine: one bare LLM call per unit, concurrent, with per-unit
// verdicts collected into a report.
//
// "Bare" is the whole point and the reason this is not built on `freecode -p`.
// A sweep sends exactly the sweep's own system prompt and its own user message —
// no coding-agent identity, no tool roster, no AGENTS.md. The model being
// audited should not know what freecode is; it should see a task and its inputs.
// `-p` is the opposite by design, and layering a sweep on it would contaminate
// every verdict with project context the unit prompt never asked for.
//
// Everything provider-shaped is inherited from src/: model resolution and the
// free-only guard (providers/provider-registry.ts), and the per-provider retry
// gate (providers/adapters/adapter-http-retry.ts) that makes concurrency safe —
// one worker meeting a 429 parks the rest for the same window instead of each
// rediscovering the limit alone.

import { relative } from 'path';
// Type-only: erased at compile time, so it does not pull a provider module into
// evaluation before prepareSweepEnv() runs.
import type { ResolvedModel } from '../../src/providers/provider-registry.js';
import { prepareSweepEnv } from './env.js';
import { mapPool } from './pool.js';
import { parseSweepArgs, sanitize, type SweepOptions } from './args.js';
import { createReporter, countUnits, summarize, writeReport } from './report.js';
import { installFetchProbe, resetDiagnostics, recordWait, unitContext } from './http-probe.js';
import { ERROR_VERDICT, type SweepDefinition, type SweepOutcome } from './types.js';

export type { SweepDefinition, SweepOutcome, SweepVerdict, SweepOptions } from './types.js';
export { ERROR_VERDICT } from './types.js';

// Generous: on a free model the largest units run into the minutes, so a tighter
// ceiling turns the slowest real answers into errors.
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Current provider-side retry wait, fed by the adapter's retry banner sink (a
 * sweep does not go through `src/index.ts`, so nothing registers one for it). A
 * `retry-after` is honored in full and can be minutes long; without this the status
 * line's ticker keeps moving and a parked run is indistinguishable from a working one.
 */
let retryHold: { label: string; targetMs: number } | null = null;

function retryHoldSuffix(): string {
  if (!retryHold) return '';
  const remaining = retryHold.targetMs - Date.now();
  if (remaining <= 0) return '';
  return ` · ${retryHold.label} ${Math.ceil(remaining / 1000)}s`;
}

/**
 * `String(x)` on a thrown plain object is `[object Object]`, which leaves the
 * report with no evidence of what went wrong — three nemotron failures were
 * lost that way. Providers do throw bare objects, so fall back to their fields.
 */
function describeThrown(value: unknown): string {
  if (value instanceof Error) return value.message;
  const text = String(value);
  if (text !== '[object Object]') return text;
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') return json.slice(0, 500);
  } catch {
    // Circular or throwing-getter payload: nothing better to say than the default.
  }
  return text;
}

// Duck-types the statusCode/responseBody fields present on both real AI SDK
// APICallErrors and the plain Error the openai-compat adapter throws.
function describeError(error: unknown): string {
  const e = error as { statusCode?: unknown; responseBody?: unknown };
  const message = describeThrown(error);
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  let detail = statusCode !== undefined && !message.includes(`HTTP ${statusCode}`)
    ? `HTTP ${statusCode}: ${message}`
    : message;
  if (typeof e?.responseBody === 'string') {
    const trimmed = e.responseBody.trim().slice(0, 500);
    if (trimmed && !detail.includes(trimmed.slice(0, 50))) detail += ` — body: ${trimmed}`;
  }
  return detail;
}

function applyFilters<Unit>(
  units: Unit[],
  definition: SweepDefinition<Unit>,
  options: SweepOptions,
): Unit[] {
  const filtered = options.only
    ? units.filter(unit => definition.label(unit).includes(options.only as string))
    : units;
  return options.limit === undefined ? filtered : filtered.slice(0, options.limit);
}

/**
 * Entry point for a sweep script: parses the shared flags, prepares credentials,
 * runs every unit, writes the report. Resolves to the process exit code.
 *
 * The caller must not import anything from `src/` at module scope — see env.ts
 * for why credentials have to be in place before a provider module evaluates.
 */
export async function runSweep<Unit>(
  definition: SweepDefinition<Unit>,
  argv: string[],
  defaults: { outDir: string; concurrency?: number },
): Promise<number> {
  let options: SweepOptions;
  try {
    options = parseSweepArgs(argv, defaults);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const allUnits = definition.collect();
  const units = applyFilters(allUnits, definition, options);

  // Collection touches no provider, so --dry-run verifies the unit rule over the
  // whole tree without spending a single call.
  if (options.dryRun) {
    console.log(`${countUnits(units.length, definition.unitNoun)} would be checked:`);
    for (const unit of units) {
      console.log(`  ${definition.describe ? definition.describe(unit) : definition.label(unit)}`);
    }
    return 0;
  }

  if (units.length === 0) {
    console.error(`No ${definition.unitNoun}s matched.`);
    return 1;
  }

  prepareSweepEnv();

  // Dynamic imports so the env prepared above is in place before any provider
  // module evaluates (see env.ts).
  const { resolveModel } = await import('../../src/providers/provider-registry.js');
  const { loadConfig } = await import('../../src/config/index.js');
  const { registerRetryBannerSink } = await import('../../src/providers/adapters/adapter-http-retry.js');
  const { streamText } = await import('ai');

  installFetchProbe();
  // The sink fires inside the waiting call's async context, so each wait is
  // attributable to a unit; `null` just closes the display and is not recorded.
  registerRetryBannerSink(info => {
    retryHold = info;
    if (!info) return;
    recordWait(info.label, info.targetMs - Date.now());
  });

  const modelPreference = options.model ?? loadConfig().defaultModel;
  if (!modelPreference) {
    console.error('No model selected. Pass --model provider:model, or set one with /model.');
    return 1;
  }

  // Resolved once, not once per unit: a bad --model string (or a paid one, which
  // the free-only guard refuses here) fails before any work instead of producing
  // one identical error per unit.
  let model: ResolvedModel['model'];
  try {
    ({ model } = resolveModel(modelPreference));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  console.log(`\n${modelPreference} — ${countUnits(units.length, definition.unitNoun)}, concurrency ${options.concurrency}\n`);
  const reporter = createReporter<Unit>(units.length, definition.primaryVerdict, retryHoldSuffix);
  const startedAt = Date.now();

  resetDiagnostics();

  const outcomes = await mapPool(units, options.concurrency, async (unit, index): Promise<SweepOutcome<Unit>> =>
    unitContext.run({ index, requests: 0 }, async (): Promise<SweepOutcome<Unit>> => {
      const unitStartedAt = Date.now();
      let verdict: string;
      let finding: boolean;
      let detail: string;
      let recovered = false;
      try {
        const result = await streamText({
          model,
          system: definition.system,
          messages: [{ role: 'user', content: definition.user(unit) }],
          temperature: definition.temperature ?? 0,
          maxRetries: 2,
          abortSignal: AbortSignal.timeout(definition.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        // Errors surface on consumption, not at the call site — the stream must
        // be drained inside the try/catch or failures go unnoticed.
        for await (const _chunk of result.textStream) {
          // discard; the assembled text is read below
        }
        const classified = definition.classify(await result.text);
        ({ verdict, finding, detail } = classified);
        recovered = classified.recovered === true;
      } catch (error) {
        verdict = ERROR_VERDICT;
        finding = true;
        detail = describeError(error);
      }
      const outcome: SweepOutcome<Unit> = {
        unit,
        label: definition.label(unit),
        verdict,
        finding,
        detail,
        recovered,
        durationMs: Date.now() - unitStartedAt,
        startedAtMs: unitStartedAt - startedAt,
        requests: unitContext.getStore()?.requests ?? 0,
      };
      reporter.complete(outcome);
      return outcome;
    }));

  reporter.finish();
  const elapsedMs = Date.now() - startedAt;
  const path = writeReport(
    {
      outDir: options.outDir,
      fileStem: sanitize(modelPreference),
      title: definition.name,
      modelPreference,
      unitNoun: definition.unitNoun,
      primaryVerdict: definition.primaryVerdict,
    },
    outcomes,
    elapsedMs,
  );
  console.log(`\n${summarize(outcomes, definition.unitNoun, definition.primaryVerdict, elapsedMs)}`);
  console.log(`→ ${relative(process.cwd(), path).replace(/\\/g, '/')}`);
  return 0;
}
