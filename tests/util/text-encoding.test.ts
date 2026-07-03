import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { stripBom, readTextFile, readJsonFile, hasBom } from '../../src/util/text-encoding.js';

describe('stripBom', () => {
  it('removes a leading BOM', () => {
    expect(stripBom('﻿{"a":1}')).toBe('{"a":1}');
  });

  it('leaves text without a BOM untouched', () => {
    expect(stripBom('{"a":1}')).toBe('{"a":1}');
  });

  it('never touches control characters elsewhere in the text', () => {
    expect(stripBom('﻿send: \x7f')).toBe('send: \x7f');
  });
});

describe('hasBom', () => {
  it('detects the 3-byte UTF-8 BOM', () => {
    expect(hasBom(Buffer.from([0xEF, 0xBB, 0xBF, 0x7B]))).toBe(true);
  });

  it('rejects content without a BOM', () => {
    expect(hasBom(Buffer.from('{"a":1}'))).toBe(false);
  });

  it('rejects buffers shorter than 3 bytes', () => {
    expect(hasBom(Buffer.from([0xEF, 0xBB]))).toBe(false);
  });
});

describe('readTextFile / readJsonFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'text-encoding-test-'));

  it('strips a BOM written by an external editor', () => {
    const path = join(dir, 'note.txt');
    writeFileSync(path, '﻿hello');
    expect(readTextFile(path)).toBe('hello');
  });

  it('parses JSON that would otherwise throw on a leading BOM', () => {
    const path = join(dir, 'data.json');
    writeFileSync(path, '﻿{"a":1}');
    expect(readJsonFile<{ a: number }>(path)).toEqual({ a: 1 });
  });
});
