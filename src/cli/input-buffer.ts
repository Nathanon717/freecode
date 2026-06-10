let lastInputBuf = '';
let cursorPos = 0;

export function getInputBuffer(): string { return lastInputBuf; }
export function getCursorPos(): number { return cursorPos; }

export function setInputBuffer(input: string): void {
  lastInputBuf = input;
  cursorPos = input.length;
}

export function insertAtCursor(text: string): void {
  lastInputBuf = lastInputBuf.slice(0, cursorPos) + text + lastInputBuf.slice(cursorPos);
  cursorPos += text.length;
}

export function backspaceAtCursor(): void {
  if (cursorPos > 0) {
    lastInputBuf = lastInputBuf.slice(0, cursorPos - 1) + lastInputBuf.slice(cursorPos);
    cursorPos--;
  }
}

export function deleteAtCursor(): void {
  if (cursorPos < lastInputBuf.length) {
    lastInputBuf = lastInputBuf.slice(0, cursorPos) + lastInputBuf.slice(cursorPos + 1);
  }
}

export function moveCursorLeft(): void { if (cursorPos > 0) cursorPos--; }
export function moveCursorRight(): void { if (cursorPos < lastInputBuf.length) cursorPos++; }

export function moveCursorHome(): void {
  const before = lastInputBuf.slice(0, cursorPos);
  cursorPos = before.lastIndexOf('\n') + 1;
}

export function moveCursorEnd(): void {
  const after = lastInputBuf.slice(cursorPos);
  const nextNl = after.indexOf('\n');
  cursorPos = nextNl === -1 ? lastInputBuf.length : cursorPos + nextNl;
}

export function moveCursorUp(): void {
  const lines = lastInputBuf.split('\n');
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (cursorPos <= lineEnd) {
      if (i === 0) return;
      const col = cursorPos - pos;
      cursorPos = pos - lines[i - 1].length - 1 + Math.min(col, lines[i - 1].length);
      return;
    }
    pos = lineEnd + 1;
  }
}

export function moveCursorDown(): void {
  const lines = lastInputBuf.split('\n');
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (cursorPos <= lineEnd) {
      if (i === lines.length - 1) return;
      const col = cursorPos - pos;
      cursorPos = lineEnd + 1 + Math.min(col, lines[i + 1].length);
      return;
    }
    pos = lineEnd + 1;
  }
}

// Number of terminal rows a single logical input line occupies.
// Uses floor+1 so that a line exactly filling the effective width opens a blank
// overflow row and parks the cursor at its start — the visual behaviour the user sees.
export function visualRowsForLine(content: string, w: number): number {
  const effW = Math.max(1, w - 2); // 2-char prompt prefix ('> ' or '  ')
  return Math.floor(content.length / effW) + 1;
}

// Maps a cursor position in the flat buffer to a (visualRow, visualCol) pair
// where visualRow is 0-indexed from the top of the input area and visualCol is
// 0-indexed within the content of that row (after the 2-char prefix).
export function cursorToVisualPos(
  buf: string,
  cursor: number,
  w: number,
): { visualRow: number; visualCol: number } {
  const effW = Math.max(1, w - 2);
  const lines = buf.split('\n');
  let pos = 0;
  let visualRow = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = pos;
    const lineEnd = pos + lines[i].length;
    if (cursor >= lineStart && cursor <= lineEnd) {
      const colInLine = cursor - lineStart;
      return {
        visualRow: visualRow + Math.floor(colInLine / effW),
        visualCol: colInLine % effW,
      };
    }
    visualRow += Math.floor(lines[i].length / effW) + 1;
    pos = lineEnd + 1;
  }
  return { visualRow: 0, visualCol: 0 };
}
