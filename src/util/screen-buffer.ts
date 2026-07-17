const MAX_LINES = 150;
const displayLineBufferStyled: string[] = [];
let installed = false;
// Index into displayLineBufferStyled marking the start of the current
// scroll-region epoch.  Lines before this index were written before the input
// UI's scroll region was established (e.g. the startup banner) and must not be
// used to repaint overlay rows.
let epochStart = 0;

export function stripAnsi(str: string): string {
  return str.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|[^[])/g, '');
}

function hasCursorOrScreenControl(str: string): boolean {
  return /\x1b(?:\[[0-9;?]*[HJKrstu]|\[[su]|[DM78])/.test(str);
}

// Erase-in-Display (ED): `\x1b[J`, `\x1b[0J`, `\x1b[1J`, `\x1b[2J`, `\x1b[3J`.
// Matches a full-screen / scrollback wipe but NOT line erase (`\x1b[2K`).
function hasFullScreenErase(str: string): boolean {
  return /\x1b\[[0-3]?J/.test(str);
}

function pushDisplayLines(styled: string): void {
  const styledLines = styled.split('\n');
  // Trailing-newline test on the ANSI-stripped text: a write may place an escape
  // sequence after its final \n, which would make styled not end in \n even
  // though it logically has a trailing blank line.
  const count = stripAnsi(styled).endsWith('\n') ? styledLines.length - 1 : styledLines.length;
  for (let i = 0; i < count; i++) {
    displayLineBufferStyled.push(styledLines[i]?.trimEnd() ?? '');
    if (displayLineBufferStyled.length > MAX_LINES) {
      displayLineBufferStyled.shift();
      if (epochStart > 0) epochStart--;
    }
  }
}

export function installScreenBuffer(): void {
  if (installed) return;
  installed = true;

  const original = process.stdout.write.bind(process.stdout);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (process.stdout as any).write = function (chunk: string | Buffer, ...args: unknown[]): boolean {
    if (typeof chunk === 'string') {
      if (hasFullScreenErase(chunk)) {
        // A full-screen / scrollback erase wipes everything currently on
        // screen, so nothing buffered can still sit behind a suggestion
        // overlay. Drop the buffer and reset the epoch; the banner a redraw
        // prints next becomes the new pre-epoch chrome once the caller
        // re-marks the epoch via startOverlayEpoch(). Without this, a redrawn
        // banner would be resurrected into overlay repaints as stale content.
        displayLineBufferStyled.length = 0;
        epochStart = 0;
      }
      if (!hasCursorOrScreenControl(chunk)) {
        const styled = chunk.replace(/\r/g, '');
        pushDisplayLines(styled);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return (original as any)(chunk, ...args);
  };
}

// Records the current write position as the start of the scroll-region epoch.
// Lines before this index (the banner and other chrome) are excluded from
// overlay repaints. Call it right after every banner (re)draw so the freshly
// printed banner is treated as chrome — not just once at startup, since
// /clear, /model, /config, /eval and resize all reprint the banner mid-session
// and their banner lines would otherwise leak into overlay repaints. Do NOT
// call it from per-turn input reinit that isn't preceded by a screen clear, or
// it would discard transcript lines the user can still see.
export function startOverlayEpoch(): void {
  epochStart = displayLineBufferStyled.length;
}

// Returns the lines that should repaint the n overlay rows when a suggestion
// list closes.  freecode parks the cursor at the bottom of the scroll region
// before writing output, so each newline scrolls content upward and the
// bottom row is always blank after printing.  The preceding count-1 rows hold
// the last min(L, count-1) lines of scroll-region output, with blank padding
// at the top when L < count-1.  Lines are returned with their original ANSI
// color codes intact so the restore does not bleach content.
export function getScreenBufferDisplayLinesForOverlay(count: number, _scrollHeight: number): string[] {
  const epochLines = displayLineBufferStyled.slice(epochStart);
  const L = epochLines.length;
  const contentCount = Math.min(L, count - 1);
  const topBlanks = count - 1 - contentCount;
  const content = contentCount > 0 ? epochLines.slice(L - contentCount) : [];
  return [...Array.from({ length: topBlanks }, () => ''), ...content, ''];
}
