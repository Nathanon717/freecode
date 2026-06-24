import type { RetryBannerInfo } from '../providers/adapters/adapter-http-retry.js';

/**
 * Retry-banner sink for non-TTY sessions: renders the "retrying in Ns" countdown
 * to stdout. This is the presentation half of the retry flow — the adapter only
 * emits target times; how (and whether) they are shown belongs to the CLI layer.
 */
export function createStdoutRetrySink(): (info: RetryBannerInfo | null) => void {
  let tick: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
  };

  return (info) => {
    stop();
    if (!info) return;
    const { name, label, targetMs } = info;
    let remaining = Math.max(1, Math.ceil((targetMs - Date.now()) / 1000));
    process.stdout.write(`\n${name} ${label} — retrying in ${remaining}s...`);
    tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        process.stdout.write(`\r\x1b[2K${name} ${label} — retrying now...\n`);
      } else {
        process.stdout.write(`\r${name} ${label} — retrying in ${remaining}s...`);
      }
    }, 1000);
  };
}
