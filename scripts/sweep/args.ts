// The flag set every sweep gets. Kept here rather than per-script so that
// `--only`/`--limit` (the fast prompt-iteration loop) and `--dry-run` (verify
// unit collection without spending a call) behave identically across sweeps.

export interface SweepOptions {
  /** `provider:model`. Falls back to the configured default model when absent. */
  model?: string;
  /** Keep only units whose label contains this substring. */
  only?: string;
  /** Stop after this many units, applied after `only`. */
  limit?: number;
  concurrency: number;
  outDir: string;
  dryRun: boolean;
}

export interface ParseArgsDefaults {
  outDir: string;
  concurrency?: number;
}

/**
 * Throws on an unknown flag or a missing value rather than ignoring it: a sweep
 * is a long, spending run, and a typo silently reverting to defaults is a whole
 * wasted sweep.
 */
export function parseSweepArgs(argv: string[], defaults: ParseArgsDefaults): SweepOptions {
  let model: string | undefined;
  let only: string | undefined;
  let limit: number | undefined;
  let concurrency = defaults.concurrency ?? 8;
  let outDir = defaults.outDir;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    const needsValue = (): string => {
      if (value === undefined) throw new Error(`${arg} requires a value`);
      i++;
      return value;
    };
    switch (arg) {
      case '--model':
        // A sweep runs exactly one model. Silently taking the last of two would
        // report the wrong model id at the top of the report.
        if (model !== undefined) throw new Error('--model may only be given once');
        model = needsValue();
        break;
      case '--only': only = needsValue(); break;
      case '--limit': limit = numeric(arg, needsValue()); break;
      case '--concurrency': concurrency = numeric(arg, needsValue()); break;
      case '--out': outDir = needsValue(); break;
      case '--dry-run': dryRun = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { model, only, limit, concurrency, outDir, dryRun };
}

function numeric(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} requires a positive integer, got "${raw}"`);
  }
  return value;
}

/** Filename-safe form of a model preference, for report paths. */
export function sanitize(modelPreference: string): string {
  return modelPreference.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
