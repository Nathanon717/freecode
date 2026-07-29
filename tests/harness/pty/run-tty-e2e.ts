import { createPtyDriver } from './driver.js';
import { matchBlock, matchStyles, type ScreenRow, type StyleExpectation } from './screen-assert.js';

export interface TtyStep {
  name?: string;
  // Keystrokes to send before asserting. Supports raw control chars, e.g.
  // "\t" (tab), "\r" (enter), "" (Ctrl-C).
  send?: string;
  // Resize the PTY (and emulator viewport) to these dimensions before asserting,
  // delivering a real SIGWINCH exactly as dragging a terminal edge would. Applied
  // after `send`, so a step can type then resize. How long the child takes to hear
  // about it is the terminal's business, not ours — ConPTY 1.25 is ~1-1.5s — so
  // `screenContains` is what paces a resize step; it is waited for, not sampled.
  resize?: { cols: number; rows: number };
  // Wait until this text appears in the raw stream before asserting.
  waitFor?: string;
  // Override the per-step waitFor budget (ms). Default 8000. Raise this for
  // heavy steps (e.g. running a real subprocess) that can stall under the
  // CPU contention of many TTY e2e tests running in parallel.
  waitForMs?: number;
  // Substrings that must / must not appear on the rendered viewport.
  screenContains?: string[];
  screenAbsent?: string[];
  // Substrings that must appear an exact number of times on the viewport. Use
  // this to catch stale duplicates that substring presence/absence can't — e.g.
  // a resize leaving a second, ghost copy of the input frame ("> " prompt) on
  // screen, where the correct state has exactly one.
  screenCounts?: Record<string, number>;
  // Consecutive rows that must appear verbatim on the viewport. Blank lines are
  // significant, so unlike screenContains this can enforce layout: divider
  // spacing, the blank line between response text and a tool call, preview
  // indentation. A line may be "*" (any one row), "..." (any number of rows), or
  // "re:<pattern>" (regex, for width-dependent content such as the divider).
  screenBlock?: string[];
  // The same, against scrollback + viewport. A full multi-step turn is taller
  // than the viewport, so anything beyond one short step needs this.
  transcriptBlock?: string[];
  // Colour and attribute assertions on the cells behind on-screen text — the
  // one thing substring matching can never reach. Only non-blank cells are
  // checked. See screen-assert.ts for the colour naming.
  screenStyles?: StyleExpectation[];
  // Override the per-step quiet-settle window (ms).
  quietMs?: number;
}

export interface TtyE2eTest {
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
  // when TTY_TIMING is set; consumed by `npm run time -- e2e <name>` to
  // render a per-phase breakdown. Pure measurement — affects nothing else.
  phases: TtyPhase[];
}

function applyMask(text: string, mask?: string[]): string {
  if (!mask?.length) return text;
  let out = text;
  for (const pattern of mask) out = out.replace(new RegExp(pattern, 'g'), '');
  return out;
}

/** Row-wise mask, so a block assertion sees the same text a substring one does. */
function maskRows(rows: string[], mask?: string[]): string[] {
  if (!mask?.length) return rows;
  return rows.map((row) => applyMask(row, mask));
}

const TTY_TIMING = !!process.env.TTY_TIMING;

/**
 * How long a step may wait for its `screenContains` needles to appear on the
 * viewport. Only a step that hasn't reached its expected state spends any of
 * this; the common case returns on the first poll, so the budget costs time
 * only on a step that is going to fail anyway.
 */
const SCREEN_STATE_BUDGET_MS = 4000;

/**
 * A resize step gets much longer, because the wait is on the *terminal* handing
 * the size change to the child and nothing about it is under our control:
 * ConPTY 1.25 takes ~1-1.5s idle (15ms on 1.23 — see
 * docs/bug log/29-07-2026f.md), and that stretches further under the CPU
 * contention of a full `npm test`, where the non-TTY e2e phase runs alongside.
 * Sized to swallow that with margin rather than to be tight.
 */
const RESIZE_STATE_BUDGET_MS = 10000;

/**
 * Poll the rendered viewport until every needle is present, or the budget runs
 * out. Returns whether the state was reached: a caller that got it can settle
 * briefly, while a caller that timed out still asserts (and fails) on a fully
 * settled screen. Positive expectations only — an absence can't be waited for,
 * and asserting one before the positives land would read a half-drawn screen.
 */
async function waitForScreen(
  driver: { snapshot(): string[] },
  needles: string[],
  mask: string[] | undefined,
  budgetMs: number,
): Promise<boolean> {
  if (!needles.length) return false;
  const start = Date.now();
  for (;;) {
    const screen = applyMask(driver.snapshot().join('\n'), mask);
    if (needles.every((needle) => screen.includes(needle))) return true;
    if (Date.now() - start >= budgetMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Authoring aid for block assertions: `TTY_DUMP=1` prints each step's rendered
 * rows, numbered and quoted, so a `screenBlock` can be copied from what the app
 * actually drew instead of guessed at. Blank rows are shown, since they are the
 * part a block assertion exists to pin. Pure diagnostics — changes nothing.
 */
const TTY_DUMP = !!process.env.TTY_DUMP;

function dumpRows(label: string, rows: string[]): void {
  console.log(`\n--- ${label} (${rows.length} rows) ---`);
  rows.forEach((row, i) => console.log(`${String(i).padStart(3)} ${JSON.stringify(row)}`));
}

export async function runTtyE2eTest(opts: {
  testName: string;
  tty: TtyE2eTest;
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
      if (step.resize) driver.resize(step.resize.cols, step.resize.rows);

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
      // Wait for the app to have actually reached the asserted state before
      // settling. Neither of the cheaper signals can stand in for this: `raw` is
      // cumulative, so a needle any earlier step printed matches instantly, and
      // silence means "hasn't started reacting yet" just as readily as "done"
      // — driver.waitQuiet() returns immediately when the stream was already
      // quiet for quietMs. That gap is invisible while a resize reaches the
      // child in ~15ms, and wide open on ConPTY 1.25, which takes ~1-1.5s (see
      // docs/bug log/29-07-2026f.md). Polling the rendered viewport — the same
      // surface the assertions read — costs nothing when the state is already
      // there and covers the latency when it isn't.
      const screenConfirmed = await waitForScreen(
        driver,
        step.screenContains ?? [],
        tty.mask,
        step.resize ? RESIZE_STATE_BUDGET_MS : SCREEN_STATE_BUDGET_MS,
      );
      await driver.settle(step.quietMs ?? (screenConfirmed ? 100 : 350));

      const screen = applyMask(driver.snapshot().join('\n'), tty.mask);
      if (TTY_DUMP) dumpRows(label, maskRows(driver.snapshot({ keepTrailingBlanks: true }), tty.mask));
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
      for (const [needle, want] of Object.entries(step.screenCounts ?? {})) {
        const got = needle ? screen.split(needle).length - 1 : 0;
        if (got !== want) {
          failures.push(`[${label}] screen has ${got}×${JSON.stringify(needle)}, expected ${want}`);
        }
      }

      // Blank rows carry layout, so blocks read with keepTrailingBlanks: a step
      // whose contract ends in a blank line would otherwise have it trimmed off.
      if (step.screenBlock?.length) {
        const rows = maskRows(driver.snapshot({ keepTrailingBlanks: true }), tty.mask);
        for (const failure of matchBlock(rows, step.screenBlock)) {
          failures.push(`[${label}] ${failure}`);
        }
      }
      if (step.transcriptBlock?.length) {
        const rows = maskRows(driver.transcript({ keepTrailingBlanks: true }), tty.mask);
        for (const failure of matchBlock(rows, step.transcriptBlock)) {
          failures.push(`[${label}] ${failure}`);
        }
      }
      if (step.screenStyles?.length) {
        // Unmasked: masking rewrites the text without touching the cells behind
        // it, which would misalign every column index.
        const rows: ScreenRow[] = driver.cells('scrollback');
        for (const failure of matchStyles(rows, step.screenStyles)) {
          failures.push(`[${label}] ${failure}`);
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
