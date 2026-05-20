import { createPtyDriver } from './driver.js';

export interface TtyStep {
  name?: string;
  // Keystrokes to send before asserting. Supports raw control chars, e.g.
  // "\t" (tab), "\r" (enter), "\u0003" (Ctrl-C).
  send?: string;
  // Wait until this text appears in the raw stream before asserting.
  waitFor?: string;
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

export interface TtyRunResult {
  failures: string[];
  transcript: string;
  finalScreen: string;
}

function applyMask(text: string, mask?: string[]): string {
  if (!mask?.length) return text;
  let out = text;
  for (const pattern of mask) out = out.replace(new RegExp(pattern, 'g'), '');
  return out;
}

export async function runTtyScenario(opts: {
  scenarioName: string;
  tty: TtyScenario;
  entry: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<TtyRunResult> {
  const { tty } = opts;
  const failures: string[] = [];

  const driver = createPtyDriver({
    command: process.execPath,
    args: [opts.entry],
    cwd: opts.cwd,
    env: opts.env,
    cols: tty.cols,
    rows: tty.rows,
  });

  try {
    const ready = await driver.waitForText(tty.readyText ?? 'for commands', 15000);
    if (!ready) {
      failures.push(`prompt never became ready (waited for ${JSON.stringify(tty.readyText ?? 'for commands')})`);
    }
    await driver.settle(400);

    for (let i = 0; i < tty.steps.length; i++) {
      const step = tty.steps[i];
      const label = step.name ?? `step ${i + 1}`;

      if (step.send) driver.send(step.send);
      if (step.waitFor) {
        const seen = await driver.waitForText(step.waitFor, 8000);
        if (!seen) failures.push(`[${label}] waitFor not seen: ${JSON.stringify(step.waitFor)}`);
      }
      await driver.settle(step.quietMs ?? 350);

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
    }

    driver.send(tty.exit ?? '\u0003');
    const exited = await driver.waitExit(5000);
    if (tty.expectExit && !exited) {
      failures.push('process did not exit after exit keystroke');
    }
    if (exited && tty.exitCode !== undefined && driver.exitCode() !== tty.exitCode) {
      failures.push(`exitCode: expected ${tty.exitCode}, got ${driver.exitCode()}`);
    }

    return {
      failures,
      transcript: driver.transcript().join('\n'),
      finalScreen: driver.snapshot().join('\n'),
    };
  } finally {
    driver.kill();
  }
}
