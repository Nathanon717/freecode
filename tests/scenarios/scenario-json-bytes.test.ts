// check-tests: orphan

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// Guard against a recurring authoring trap: escape sequences like `` (ESC)
// or `` (Ctrl-C) in scenario `send`/`exit` values can get collapsed into
// raw control BYTES when a file is authored through a JSON transport that
// unescapes them. A raw control byte inside a JSON string literal is illegal,
// so JSON.parse later throws the cryptic "Bad control character in string
// literal" with no filename — see docs/bug log. The fix is always to keep the
// literal 6-char text `` on disk. This test catches the mangled form
// early, names the file + line, and tells you what to do.
const SCENARIOS_DIR = dirname(fileURLToPath(import.meta.url));

// Control bytes that are legal whitespace inside a JSON document.
const ALLOWED = new Set([0x09 /* tab */, 0x0a /* LF */, 0x0d /* CR */]);

const scenarioFiles = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));

describe('scenario JSON files contain no raw control bytes', () => {
  it.each(scenarioFiles)('%s has only escaped control characters', (file) => {
    const buf = readFileSync(join(SCENARIOS_DIR, file));
    const offenders: string[] = [];
    let line = 1;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b === 0x0a) line++;
      if (b < 0x20 && !ALLOWED.has(b)) {
        const hex = '0x' + b.toString(16).padStart(2, '0');
        offenders.push(`raw control byte ${hex} at line ${line} — use the literal escape text (e.g. \\u${b.toString(16).padStart(4, '0')}) instead of an actual control byte`);
      }
    }
    expect(offenders, `${file} contains raw control bytes; an escape sequence was likely mangled in transport:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
