import { beforeEach, describe, expect, it } from 'vitest';
import {
  getInputBuffer,
  getCursorPos,
  setInputBuffer,
  insertAtCursor,
  backspaceAtCursor,
  deleteAtCursor,
  moveCursorLeft,
  moveCursorRight,
  moveCursorHome,
  moveCursorEnd,
  moveCursorUp,
  moveCursorDown,
  visualRowsForLine,
  cursorToVisualPos,
} from '../../src/cli/input-buffer.js';

beforeEach(() => {
  setInputBuffer('');
});

describe('setInputBuffer / getInputBuffer / getCursorPos', () => {
  it('sets the buffer and moves cursor to end', () => {
    setInputBuffer('hello');
    expect(getInputBuffer()).toBe('hello');
    expect(getCursorPos()).toBe(5);
  });

  it('setting empty buffer resets cursor to 0', () => {
    setInputBuffer('abc');
    setInputBuffer('');
    expect(getInputBuffer()).toBe('');
    expect(getCursorPos()).toBe(0);
  });
});

describe('insertAtCursor', () => {
  it('appends when cursor is at end', () => {
    setInputBuffer('hel');
    insertAtCursor('lo');
    expect(getInputBuffer()).toBe('hello');
    expect(getCursorPos()).toBe(5);
  });

  it('inserts in the middle when cursor is not at end', () => {
    setInputBuffer('hlo');
    moveCursorLeft();
    moveCursorLeft();
    insertAtCursor('el');
    expect(getInputBuffer()).toBe('hello');
  });
});

describe('backspaceAtCursor', () => {
  it('deletes the character before the cursor', () => {
    setInputBuffer('abc');
    backspaceAtCursor();
    expect(getInputBuffer()).toBe('ab');
    expect(getCursorPos()).toBe(2);
  });

  it('does nothing when cursor is at the start', () => {
    setInputBuffer('abc');
    moveCursorHome();
    backspaceAtCursor();
    expect(getInputBuffer()).toBe('abc');
    expect(getCursorPos()).toBe(0);
  });
});

describe('deleteAtCursor', () => {
  it('deletes the character at the cursor position', () => {
    setInputBuffer('abc');
    moveCursorLeft();
    deleteAtCursor();
    expect(getInputBuffer()).toBe('ab');
    expect(getCursorPos()).toBe(2);
  });

  it('does nothing when cursor is at the end', () => {
    setInputBuffer('abc');
    deleteAtCursor();
    expect(getInputBuffer()).toBe('abc');
  });
});

describe('moveCursorLeft / moveCursorRight', () => {
  it('moves cursor one position left', () => {
    setInputBuffer('abc');
    moveCursorLeft();
    expect(getCursorPos()).toBe(2);
  });

  it('does not move cursor below 0', () => {
    setInputBuffer('a');
    moveCursorLeft();
    moveCursorLeft();
    expect(getCursorPos()).toBe(0);
  });

  it('moves cursor one position right', () => {
    setInputBuffer('abc');
    moveCursorLeft();
    moveCursorLeft();
    moveCursorRight();
    expect(getCursorPos()).toBe(2);
  });

  it('does not move cursor past buffer length', () => {
    setInputBuffer('a');
    moveCursorRight();
    expect(getCursorPos()).toBe(1);
  });
});

describe('moveCursorHome / moveCursorEnd', () => {
  it('home moves cursor to start of current line', () => {
    setInputBuffer('first\nsecond');
    // cursor is at 12 (end), on 'second'
    moveCursorHome();
    expect(getCursorPos()).toBe(6); // start of 'second'
  });

  it('home on first line moves to 0', () => {
    setInputBuffer('hello');
    moveCursorHome();
    expect(getCursorPos()).toBe(0);
  });

  it('end moves cursor to end of current line', () => {
    setInputBuffer('first\nsecond');
    moveCursorHome(); // cursor at 6 (start of 'second')
    moveCursorEnd();
    expect(getCursorPos()).toBe(12); // end of buffer
  });

  it('end stops at newline when on non-last line', () => {
    setInputBuffer('first\nsecond');
    moveCursorUp(); // move to 'first'
    moveCursorHome(); // cursor at 0
    moveCursorEnd();
    expect(getCursorPos()).toBe(5); // position of '\n'
  });
});

describe('moveCursorUp / moveCursorDown', () => {
  it('up moves to same column on previous line', () => {
    setInputBuffer('hello\nworld');
    // cursor at 11, col 5 in 'world'
    moveCursorUp();
    expect(getCursorPos()).toBe(5); // col 5 in 'hello'
  });

  it('up does nothing on first line', () => {
    setInputBuffer('hello');
    moveCursorLeft();
    moveCursorLeft();
    moveCursorUp();
    expect(getCursorPos()).toBe(3);
  });

  it('down moves to same column on next line', () => {
    setInputBuffer('hello\nworld');
    moveCursorUp(); // cursor at 5 (end of 'hello')
    moveCursorHome(); // cursor at 0
    moveCursorDown(); // col 0 -> start of 'world' at 6
    expect(getCursorPos()).toBe(6);
  });

  it('down does nothing on last line', () => {
    setInputBuffer('hello');
    moveCursorDown();
    expect(getCursorPos()).toBe(5);
  });
});

describe('visualRowsForLine', () => {
  it('returns 1 for a line shorter than the effective width', () => {
    expect(visualRowsForLine('hello', 80)).toBe(1);
  });

  it('returns 2 for a line that fills and overflows one visual row', () => {
    // effW = 80 - 2 = 78; a line of 79 chars overflows to 2 rows
    expect(visualRowsForLine('x'.repeat(79), 80)).toBe(2);
  });

  it('returns 1 for an empty line', () => {
    expect(visualRowsForLine('', 80)).toBe(1);
  });
});

describe('cursorToVisualPos', () => {
  it('returns (0, 0) for cursor at start', () => {
    expect(cursorToVisualPos('hello', 0, 80)).toEqual({ visualRow: 0, visualCol: 0 });
  });

  it('returns correct column for cursor within first line', () => {
    expect(cursorToVisualPos('hello', 3, 80)).toEqual({ visualRow: 0, visualCol: 3 });
  });

  it('returns correct row and column after a newline', () => {
    // 'abc\ndef', cursor at 5 = 'd' in second line (col 1)
    expect(cursorToVisualPos('abc\ndef', 5, 80)).toEqual({ visualRow: 1, visualCol: 1 });
  });
});
