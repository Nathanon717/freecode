/**
 * Export/reference index for scripts/diagnostics/dead-code.ts.
 *
 * Separate module for two reasons: dead-code.ts calls `runSweep()` at module
 * scope, so a test importing it would launch a full sweep; and this is the half
 * of the sweep that must be *right* rather than merely plausible. Everything
 * the model is asked to judge rests on the evidence built here, so it is pure
 * and table-tested in tests/scripts/dead-code-index.test.ts.
 *
 * What this is not: a type-aware resolver. It matches identifiers textually, so
 * it over-reports: an unrelated local sharing the name counts as a reference,
 * and two files exporting the *same* name share one index entry, so each is
 * credited with the other's callers. That is not rare — the tree currently has
 * 589 exports under 553 distinct names.
 *
 * The bias is deliberate and one-directional. An inflated reference count makes
 * the sweep miss a finding; a deflated one would make it assert something false.
 * Missing a hit costs nothing on a sweep that is free to re-run, so it is always
 * the side to err on. The model is shown the matching lines, never the count
 * alone, precisely so it can discount a bad match itself.
 */

export interface ExportSite {
  name: string;
  /** `function`, `const`, `interface`, ... or `re-export` for `export { x } from`. */
  kind: string;
  /** 1-based line of the export statement. */
  line: number;
}

/**
 * Whether a file can *use* a symbol or only *describe* it. The distinction is
 * load-bearing: `docs/map/**` mirrors every source file and its generated blocks
 * name every export, so counting a doc hit as a reference marks the entire
 * codebase live and the precompute finds nothing.
 */
export type ReferenceRole = 'code' | 'docs';

export interface Reference {
  /** Repo-relative, posix. */
  file: string;
  line: number;
  text: string;
  role: ReferenceRole;
}

export interface ExportRecord extends ExportSite {
  /** Occurrences in the declaring file, excluding the export statement itself. */
  internal: Reference[];
  /** Uses in other code files. This is the count that decides whether a symbol is live. */
  external: Reference[];
  /**
   * Mentions in documentation. Never evidence of use — a symbol with docs hits
   * and no external ones is documented *and* unused, which makes the doc a
   * second thing to delete.
   */
  docs: Reference[];
}

export interface ScannedFile {
  relative: string;
  text: string;
  role: ReferenceRole;
}

/** Long lines are evidence, not content: enough to judge, not enough to bloat a prompt. */
const MAX_REFERENCE_TEXT = 140;
/**
 * Past this many hits a symbol is obviously live and further ones change no
 * verdict, so they are dropped rather than held in memory or sent.
 */
const MAX_REFERENCES_PER_NAME = 40;

const DECLARATION =
  /^export\s+(?:(?:declare|abstract|async)\s+)*(const enum|function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
/** `export { a, b as c }` and `export type { X }`, opening brace on this line. */
const EXPORT_LIST_OPEN = /^export\s+(?:type\s+)?\{/;
/** `export * from './x'` — no name to attribute, so nothing to index. */
const EXPORT_STAR = /^export\s+\*/;
const EXPORT_DEFAULT = /^export\s+default\b/;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

function clip(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_REFERENCE_TEXT ? `${trimmed.slice(0, MAX_REFERENCE_TEXT)}…` : trimmed;
}

/**
 * Names exported by an `export { ... }` clause. `a as b` exports `b` — the name
 * an importer writes, and therefore the only one whose absence elsewhere means
 * the entry is dead.
 */
function parseExportList(body: string): string[] {
  return body
    .split(',')
    .map(entry => entry.replace(/\btype\s+/g, '').trim())
    .filter(Boolean)
    .map(entry => {
      const aliased = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(entry);
      if (aliased) return aliased[1];
      return /^[A-Za-z_$][\w$]*$/.test(entry) ? entry : '';
    })
    .filter(Boolean);
}

/**
 * Every name this file exports. Anchored at column 0: a top-level export is the
 * only kind that can be imported, and the anchor keeps `export` inside a comment
 * block or a template literal from registering.
 */
export function collectExports(source: string): ExportSite[] {
  const lines = source.split('\n');
  const sites: ExportSite[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('export')) continue;
    if (EXPORT_STAR.test(line) || EXPORT_DEFAULT.test(line)) continue;

    const declaration = DECLARATION.exec(line);
    if (declaration) {
      sites.push({ name: declaration[2], kind: declaration[1], line: i + 1 });
      continue;
    }

    if (!EXPORT_LIST_OPEN.test(line)) continue;
    // An export clause may span lines; the closing brace is what ends it, not
    // the newline. Accumulating here rather than regexing the whole file keeps
    // the declaration's line number exact.
    let body = line;
    let end = i;
    while (!body.includes('}') && end + 1 < lines.length) {
      end++;
      body += `\n${lines[end]}`;
    }
    const inner = /\{([\s\S]*?)\}/.exec(body);
    if (!inner) continue;
    // `export { x } from './y'` re-exports something this file never defines, so
    // "used only internally" cannot apply to it — zero external references means
    // the barrel entry itself is dead.
    const kind = /\}\s*from\s*['"]/.test(body) ? 're-export' : 'export-list';
    for (const name of parseExportList(inner[1])) {
      sites.push({ name, kind, line: i + 1 });
    }
    i = end;
  }

  return sites;
}

/**
 * Maps each wanted name to where it occurs across every scanned file. Built in
 * one pass over the corpus rather than one scan per name: the per-name form is
 * O(names × files) and rescans the whole tree 500-odd times.
 */
export function indexReferences(files: ScannedFile[], names: Set<string>): Map<string, Reference[]> {
  const index = new Map<string, Reference[]>();
  if (names.size === 0) return index;

  for (const file of files) {
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      IDENTIFIER.lastIndex = 0;
      // A line can name the same symbol twice; only the line matters as
      // evidence, so the second hit would be a duplicate row.
      let seen: Set<string> | undefined;
      for (const match of line.matchAll(IDENTIFIER)) {
        const name = match[0];
        if (!names.has(name)) continue;
        seen ??= new Set();
        if (seen.has(name)) continue;
        seen.add(name);
        const hits = index.get(name) ?? [];
        if (hits.length >= MAX_REFERENCES_PER_NAME) continue;
        hits.push({ file: file.relative, line: i + 1, text: clip(line), role: file.role });
        index.set(name, hits);
      }
    }
  }

  return index;
}

/** Splits each export's occurrences into same-file and elsewhere. */
export function buildExportRecords(
  sourceRelative: string,
  sites: ExportSite[],
  index: Map<string, Reference[]>,
): ExportRecord[] {
  return sites.map(site => {
    const hits = index.get(site.name) ?? [];
    const elsewhere = hits.filter(hit => hit.file !== sourceRelative);
    return {
      ...site,
      internal: hits.filter(hit => hit.file === sourceRelative && hit.line !== site.line),
      external: elsewhere.filter(hit => hit.role === 'code'),
      docs: elsewhere.filter(hit => hit.role === 'docs'),
    };
  });
}
