import { readFileSync } from 'fs';

const BOM = '﻿';

/** Removes a leading UTF-8 BOM (U+FEFF) if present. Never touches other characters. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(BOM.length) : text;
}

/** Reads a text file as UTF-8 with any leading BOM stripped. Use this instead of bare `readFileSync(path, 'utf-8')` for any file that may have been authored or edited outside this codebase (config, prompts, downloaded datasets, recorded e2e fixtures). */
export function readTextFile(path: string): string {
  return stripBom(readFileSync(path, 'utf-8'));
}

/** Reads and parses a JSON file as UTF-8 with any leading BOM stripped. `JSON.parse` throws on a raw leading BOM, which is the failure mode this exists to prevent. */
export function readJsonFile<T = unknown>(path: string): T {
  return JSON.parse(readTextFile(path)) as T;
}

/** Byte-level BOM check on raw file contents. Used by the repo-wide encoding guard (`tests/repo-encoding.test.ts`), which must inspect bytes on disk rather than a decoded string. */
export function hasBom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
}
