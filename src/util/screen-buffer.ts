const MAX_LINES = 150;
const lineBuffer: string[] = [];
const displayLineBuffer: string[] = [];
let installed = false;
// Index into displayLineBuffer marking the start of the current scroll-region
// epoch.  Lines before this index were written before the input UI's scroll
// region was established (e.g. the startup banner) and must not be used to
// repaint overlay rows.
let epochStart = 0;

function stripAnsi(str: string): string {
  return str.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|[^[])/g, '');
}

function hasCursorOrScreenControl(str: string): boolean {
  return /\x1b(?:\[[0-9;?]*[HJKrstu]|\[[su]|[DM78])/.test(str);
}

function pushDisplayLines(clean: string): void {
  const lines = clean.split('\n');
  const count = clean.endsWith('\n') ? lines.length - 1 : lines.length;
  for (let i = 0; i < count; i++) {
    displayLineBuffer.push(lines[i]?.trimEnd() ?? '');
    if (displayLineBuffer.length > MAX_LINES) {
      displayLineBuffer.shift();
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
      if (!hasCursorOrScreenControl(chunk)) {
        const clean = stripAnsi(chunk).replace(/\r/g, '');
        pushDisplayLines(clean);
        for (const line of clean.split('\n')) {
          const trimmed = line.trimEnd();
          if (trimmed && (lineBuffer.length === 0 || lineBuffer[lineBuffer.length - 1] !== trimmed)) {
            lineBuffer.push(trimmed);
            if (lineBuffer.length > MAX_LINES) lineBuffer.shift();
          }
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return (original as any)(chunk, ...args);
  };
}

export function getScreenBuffer(): string {
  return lineBuffer.join('\n');
}

export function getScreenBufferDisplayLines(count: number): string[] {
  return displayLineBuffer.slice(Math.max(0, displayLineBuffer.length - count));
}

// Records the current write position as the start of the scroll-region epoch.
// Call once at the first setupInputUI to exclude pre-UI output (e.g. the
// startup banner) from overlay repaints.  Subsequent reinits must NOT call
// this again or they would discard transcript lines the user can still see.
export function startOverlayEpoch(): void {
  epochStart = displayLineBuffer.length;
}

// Returns the lines that should repaint the n overlay rows when a suggestion
// list closes.  freecode parks the cursor at the bottom of the scroll region
// before writing output, so each newline scrolls content upward and the
// bottom row is always blank after printing.  The preceding count-1 rows hold
// the last min(L, count-1) lines of scroll-region output, with blank padding
// at the top when L < count-1.
export function getScreenBufferDisplayLinesForOverlay(count: number, scrollHeight: number): string[] {
  const epochLines = displayLineBuffer.slice(epochStart);
  const L = epochLines.length;
  const contentCount = Math.min(L, count - 1);
  const topBlanks = count - 1 - contentCount;
  const content = contentCount > 0 ? epochLines.slice(L - contentCount) : [];
  return [...Array.from({ length: topBlanks }, () => ''), ...content, ''];
}
