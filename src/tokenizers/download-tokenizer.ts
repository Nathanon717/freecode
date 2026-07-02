import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import https from 'https';
import { getStoreDir } from '../providers/model-store.js';
import type { TokenizerFamily } from './model-family.js';

export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const follow = (u: string) => {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// Cache path is keyed by family (not repo ID or model ID) to match
// count.ts's encoderCache key — one family currently maps to one canonical repo.
export function tokenizerCachePath(family: TokenizerFamily): string {
  return join(getStoreDir(), 'tokenizers', family, 'tokenizer.json');
}

// Downloads a canonical HF repo's tokenizer.json if not already cached under
// .freecode/tokenizers/<family>/tokenizer.json. Returns the cached path, or
// null (never throws) if the download fails — callers fall back to the
// generic estimate on null.
export async function ensureTokenizerFile(
  family: TokenizerFamily,
  repoId: string,
  downloadFn: (url: string, dest: string) => Promise<void> = downloadFile,
): Promise<string | null> {
  const dest = tokenizerCachePath(family);
  if (existsSync(dest)) return dest;
  try {
    await downloadFn(`https://huggingface.co/${repoId}/resolve/main/tokenizer.json`, dest);
    return dest;
  } catch {
    return null;
  }
}
