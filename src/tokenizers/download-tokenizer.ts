import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import https from 'https';
import { getStoreDir } from '../providers/model-data.js';
import type { TokenizerFamily } from './model-family.js';

// HF's `resolve/main/<file>` endpoints redirect to a CDN, and which status code
// they use is not stable across repos: some return 302, others 307/308 (a plain
// GET has no body, so all four are equivalent for us). Following only 301/302
// silently broke exactly the families whose repo answered 307 — the download
// rejected with "HTTP 307" while createWriteStream had already left a 0-byte
// file on disk. Follow the whole redirect family.
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    // createWriteStream truncates dest to 0 bytes up front, before we know the
    // response is even 200. Any failure must remove that empty/partial file so
    // it can't be mistaken for a complete cache entry.
    const fail = (err: Error) => file.close(() => { rmSync(dest, { force: true }); reject(err); });
    const follow = (u: string) => {
      https.get(u, res => {
        try {
          if (REDIRECT_CODES.has(res.statusCode ?? 0)) {
            res.resume();
            // HF's CDN redirect Location is relative (`/api/resolve-cache/...`);
            // resolve it against the current URL so https.get gets an absolute
            // one (a bare relative path throws ERR_INVALID_URL). Any throw here
            // is routed to fail() rather than escaping as an uncaught exception.
            follow(new URL(res.headers.location ?? '', u).toString());
            return;
          }
          if (res.statusCode !== 200) { fail(new Error(`HTTP ${res.statusCode}`)); return; }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', fail);
        } catch (err) {
          fail(err as Error);
        }
      }).on('error', fail);
    };
    follow(url);
  });
}

// Cache path is keyed by family (not repo ID or model ID) to match
// count.ts's encoderCache key — one family currently maps to one canonical repo.
// `filename` is the HF repo file to fetch/store: the HF-fast families use the
// default `tokenizer.json`; the Tekken family passes `tekken.json` (a different
// file in the same repo layout), so it caches beside it without collision.
export function tokenizerCachePath(family: TokenizerFamily, filename = 'tokenizer.json'): string {
  return join(getStoreDir(), 'tokenizers', family, filename);
}

// Downloads a canonical HF repo file if not already cached under
// .freecode/tokenizers/<family>/<filename>. Returns the cached path, or
// null (never throws) if the download fails — callers fall back to the
// generic estimate on null.
export async function ensureTokenizerFile(
  family: TokenizerFamily,
  repoId: string,
  filename = 'tokenizer.json',
  downloadFn: (url: string, dest: string) => Promise<void> = downloadFile,
): Promise<string | null> {
  const dest = tokenizerCachePath(family, filename);
  // A 0-byte file means a previous download died before its first body byte
  // (interrupted process, or a redirect/status we mishandled). existsSync alone
  // would pin us to that broken file forever — the exact registry would think
  // the family is covered while countTokens silently used the fallback estimate.
  // Treat empty as absent so the next run re-fetches it. size>0 (not a JSON
  // parse) keeps this cheap on the hot preload path — these files reach ~19MB.
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  // Download to a sibling temp path and only promote it to dest on a verified
  // non-empty result, so dest is *only ever* a complete file — a failed or
  // empty download can never masquerade as a cache hit. rename is atomic within
  // the same directory; the temp lives beside dest so it can't cross a fs.
  const tmp = `${dest}.download`;
  try {
    await downloadFn(`https://huggingface.co/${repoId}/resolve/main/${filename}`, tmp);
    if (!existsSync(tmp) || statSync(tmp).size === 0) { rmSync(tmp, { force: true }); return null; }
    renameSync(tmp, dest);
    return dest;
  } catch {
    rmSync(tmp, { force: true });
    return null;
  }
}
