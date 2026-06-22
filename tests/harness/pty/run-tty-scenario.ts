import { createPtyDriver } from './driver.js';

export interface TtyStep {
  name?: string;
  // Keystrokes to send before asserting. Supports raw control chars, e.g.
  // "\t" (tab), "\r" (enter), "" (Ctrl-C).
  send?: string;
  // Wait until this text appears in the raw stream before asserting.
  waitFor?: string;
  // Override the per-step waitFor budget (ms). Default 8000. Raise this for
  // heavy steps (e.g. running a real subprocess) that can stall under the
  // CPU contention of many TTY scenarios running in parallel.
  waitForMs?: number;
  // Substrings that must / must not appear on the rendered viewport.
  screenContains?: string[];
  screenAbsent?: string[];
  // Override the per-step quiet-settle window (ms).
  quietMs?: number;
}

export interface TtyScenario {
  cols?: number;
  rows?: number;
  // Text that signals the interactive prompt is live before the first step.
  readyText?: string;
  steps: TtyStep[];
  // Keystrokes used to exit at the end (default: Ctrl-C).
  exit?: string;
  // Require the process to exit cleanly after `exit` is sent.
  expectExit?: boolean;
  exitCode?: number;
  // Regex strings stripped from the screen before substring checks (for
  // volatile content such as token counts or countdowns).
  mask?: string[];
}

export interface TtyPhase {
  label: string;
  ms: number;
  ok: boolean;
}

export interface TtyRunResult {
  failures: string[];
  transcript: string;
  finalScreen: string;
  // Per-phase wall-clock timings (startup → each step → exit). Populated only
  // when TTY_TIMING is set; consumed by `npm run time -- scenarios <name>` to
  // render a per-phase breakdown. Pure measurement — affects nothing else.
  phases: TtyPhase[];
}

function applyMask(text: string, mask?: string[]): string {
  if (!mask?.length) return text;
  let out = text;
  for (const pattern of mask) out = out.replace(new RegExp(pattern, 'g'), '');
  return out;
}

const TTY_TIMING = !!process.env.TTY_TIMING;

export async function runTtyScenario(opts: {
  scenarioName: string;
  tty: TtyScenario;
  entry: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<TtyRunResult> {
  const { tty } = opts;
  const t0 = Date.now();
  const failures: string[] = [];
  const phases: TtyPhase[] = [];
  // Record a phase spanning [start, now), flagged failed if `failures` grew
  // since `failsBefore`. No-op unless timing was requested.
  const phase = (label: string, start: number, failsBefore: number): void => {
    if (TTY_TIMING) phases.push({ label, ms: Date.now() - start, ok: failures.length === failsBefore });
  };

  const driver = createPtyDriver({
    command: process.execPath,
    args: [opts.entry],
    cwd: opts.cwd,
    env: opts.env,
    cols: tty.cols,
    rows: tty.rows,
  });

  try {
    const ready = await driver.waitForText(tty.readyText ?? 'for commands', 30000);
    if (!ready) {
      failures.push(`prompt never became ready (waited for ${JSON.stringify(tty.readyText ?? 'for commands')})`);
    }
    await driver.settle(400);
    phase('startup', t0, 0);

    for (let i = 0; i < tty.steps.length; i++) {
      const step = tty.steps[i];
      const label = step.name ?? `step ${i + 1}`;
      const ts = Date.now();
      const failsBefore = failures.length;

      if (step.send) driver.send(step.send);

      // Explicit waitFor: required, 8s budget by default (override via waitForMs).
      if (step.waitFor) {
        const budget = step.waitForMs ?? 8000;
        const seen = await driver.waitForText(step.waitFor, budget);
        if (!seen) failures.push(`[${label}] waitFor not seen: ${JSON.stringify(step.waitFor)}`);
      }

      // Auto-derive from first screenContains with a short budget. Many strings
      // appear as raw text ("> /cle", "for commands") and arrive in <100ms. Some
      // are rendered via cursor-positioning escapes ("Tool rationale") and won't
      // appear raw — those let the short timeout expire and fall back to the full
      // silence-settle below, adding only ~150ms overhead.
      let fastConfirmed = false;
      if (!step.waitFor && step.screenContains?.[0]) {
        fastConfirmed = await driver.waitForText(step.screenContains[0], 150);
      }
      await driver.settle(step.quietMs ?? (fastConfirmed ? 100 : 350));

      const screen = applyMask(driver.snapshot().join('\n'), tty.mask);
      for (const needle of step.screenContains ?? []) {
        if (!screen.includes(needle)) {
          failures.push(`[${label}] screen missing: ${JSON.stringify(needle)}`);
        }
      }
      for (const needle of step.screenAbsent ?? []) {
        if (screen.includes(needle)) {
          failures.push(`[${label}] screen unexpectedly contains: ${JSON.stringify(needle)}`);
        }
      }
      phase(label, ts, failsBefore);
    }

    driver.send(tty.exit ?? '');
    const te = Date.now();
    const exitFailsBefore = failures.length;
    const exited = await driver.waitExit(5000);
    if (tty.expectExit && !exited) {
      failures.push('process did not exit after exit keystroke');
    }
    if (exited && tty.exitCode !== undefined && driver.exitCode() !== tty.exitCode) {
      failures.push(`exitCode: expected ${tty.exitCode}, got ${driver.exitCode()}`);
    }
    phase('exit', te, exitFailsBefore);

    return {
      failures,
      transcript: driver.transcript().join('\n'),
      finalScreen: driver.snapshot().join('\n'),
      phases,
    };
  } finally {
    driver.kill();
  }
}
