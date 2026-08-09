/**
 * How the codebase map is addressed: the section manifest, the page parser, and
 * the path rules that name a page.
 *
 * The manifest below is the single place that says which sections a map page
 * may have, in what order, and who writes them. The generator, the checker and
 * `map-query.ts` all read it, so changing map strategy is an edit to this array
 * rather than an edit to 115 pages.
 *
 * The parser tolerates the corpus as it stands today: the same field appears as
 * an H2 (`## Read When`) on some pages and as an inline bold label
 * (`**Read when:**`) on others, with three spellings of "neighbors". Aliases
 * resolve all of those to one canonical name, so a query works across the whole
 * corpus before the migration has touched it.
 */
import { readdirSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const MAP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'map');

export { MAP_ROOT };

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Who writes a section: docgen, or a human. */
export type SectionSource = 'generated' | 'authored';

/**
 * `canonical` sections are the target page. `legacy` sections exist today and
 * are slated for deletion — they stay in the manifest so the migration can find
 * and rescue them, and so the checker can name them when it starts refusing.
 */
export type SectionStatus = 'canonical' | 'legacy';

export interface MapSection {
  /** Exact H2 text a page must use. */
  name: string;
  source: SectionSource;
  status: SectionStatus;
  /** Whether a page must carry it once enforcement lands. */
  required: boolean;
  /**
   * Every spelling seen in the corpus, normalized (lowercased, no trailing
   * colon). Includes the canonical name itself.
   */
  aliases: string[];
}

/** Canonical order is the order of this array. */
export const MAP_SECTIONS: MapSection[] = [
  { name: 'Role', source: 'generated', status: 'canonical', required: true, aliases: ['role', 'purpose'] },
  { name: 'Read When', source: 'generated', status: 'canonical', required: false, aliases: ['read when'] },
  { name: 'Exports', source: 'generated', status: 'canonical', required: true, aliases: ['exports'] },
  {
    name: 'Neighbors',
    source: 'generated',
    status: 'canonical',
    required: true,
    aliases: ['neighbors', 'neighbours', 'key neighbors', 'key neighbours'],
  },
  { name: 'Tests', source: 'generated', status: 'canonical', required: true, aliases: ['tests'] },
  { name: 'Budget', source: 'generated', status: 'canonical', required: true, aliases: ['budget'] },
  { name: 'Env', source: 'generated', status: 'canonical', required: false, aliases: ['env'] },
  { name: 'Export Notes', source: 'authored', status: 'legacy', required: false, aliases: ['export notes'] },
  { name: 'Update Triggers', source: 'authored', status: 'legacy', required: false, aliases: ['update triggers'] },
  { name: 'Used By', source: 'authored', status: 'legacy', required: false, aliases: ['used by'] },
];

const BY_ALIAS = new Map<string, MapSection>(
  MAP_SECTIONS.flatMap(section => section.aliases.map(alias => [alias, section] as const)),
);

/** Lowercase, collapse whitespace, drop a trailing colon. */
export function normalizeSectionName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/:$/, '').toLowerCase();
}

/** Resolve any spelling — canonical, alias, inline label — to its manifest entry. */
export function lookupSection(raw: string): MapSection | undefined {
  return BY_ALIAS.get(normalizeSectionName(raw));
}

export interface ParsedSection {
  /** Canonical name when recognized, otherwise the heading exactly as written. */
  name: string;
  /** The heading exactly as written, without `## ` or `**…:**`. */
  raw: string;
  status: SectionStatus | 'tail';
  source: SectionSource | 'authored';
  syntax: 'h2' | 'inline';
  body: string;
  /** 1-based line of the heading. */
  line: number;
}

export interface ParsedPage {
  /** Map-relative posix path, e.g. `agent/loop.md`. */
  path: string;
  /** H1 text, without the leading `# `. */
  title: string;
  /**
   * Text that belongs to no section: prose sitting between the title (or an
   * inline field) and the first heading. Non-empty here is a page the migration
   * has to place by hand.
   */
  preamble: string;
  sections: ParsedSection[];
}

const FENCE = /^\s*(```|~~~)/;
const GENERATED_MARKER = /^\s*<!--\s*(BEGIN|END) GENERATED\b.*-->\s*$/;
const H1 = /^#\s+(.*)$/;
const H2 = /^##\s+(.*)$/;
const INLINE_FIELD = /^\*\*([^*]+):\*\*\s*(.*)$/;

/**
 * Split one page into its sections.
 *
 * An H2 runs to the next H2. An inline bold field runs to the first blank line
 * — a field is one paragraph, and anything after it is orphan prose the parser
 * must surface rather than silently fold into `Role`. Only labels the manifest
 * recognizes open a section; `**Agreement logic:**` is prose, not a field.
 * Headings inside fenced code are ignored, and `BEGIN/END GENERATED` markers are
 * dropped so `## Exports` does not carry its own closing marker in its body.
 */
export function parseMapPage(path: string, content: string): ParsedPage {
  const lines = content.split('\n');

  // Pass one: where the headings are. Fenced code is skipped so a `##` in an
  // example never opens a section, and the title and generated markers are
  // marked for removal so no body carries them.
  interface Mark {
    raw: string;
    syntax: 'h2' | 'inline';
    index: number;
    first: string;
  }
  const marks: Mark[] = [];
  const dropped = new Set<number>();
  let title = '';
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;

    if (GENERATED_MARKER.test(line)) {
      dropped.add(i);
      continue;
    }

    const h1 = H1.exec(line);
    if (h1) {
      if (!title) title = h1[1].trim();
      dropped.add(i);
      continue;
    }

    const h2 = H2.exec(line);
    if (h2) {
      marks.push({ raw: h2[1], syntax: 'h2', index: i, first: '' });
      continue;
    }

    const inline = INLINE_FIELD.exec(line);
    if (inline && lookupSection(inline[1])) {
      marks.push({ raw: inline[1], syntax: 'inline', index: i, first: inline[2] });
    }
  }

  // Pass two: each heading takes the lines up to the next one. An inline field
  // stops early, at its first blank line, so orphan prose falls through to the
  // preamble instead of inflating `Role`.
  const sections: ParsedSection[] = [];
  const consumed = new Set<number>(dropped);

  for (let m = 0; m < marks.length; m++) {
    const mark = marks[m];
    const stop = m + 1 < marks.length ? marks[m + 1].index : lines.length;
    const body: string[] = mark.first ? [mark.first] : [];
    consumed.add(mark.index);

    for (let i = mark.index + 1; i < stop; i++) {
      if (mark.syntax === 'inline' && lines[i].trim() === '') break;
      consumed.add(i);
      if (!dropped.has(i)) body.push(lines[i]);
    }

    const known = lookupSection(mark.raw);
    sections.push({
      name: known?.name ?? mark.raw.trim(),
      raw: mark.raw.trim(),
      status: known?.status ?? 'tail',
      source: known?.source ?? 'authored',
      syntax: mark.syntax,
      body: body.join('\n').trim(),
      line: mark.index + 1,
    });
  }

  const preamble = lines.filter((_, i) => !consumed.has(i)).join('\n').trim();
  return { path, title, preamble, sections };
}

function walkMarkdown(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(fullPath);
    if (!entry.isFile() || !fullPath.endsWith('.md')) return [];
    return [fullPath];
  });
}

/** Every map page except the nav index, map-relative and sorted. */
export function listMapPages(): string[] {
  return walkMarkdown(MAP_ROOT)
    .map(file => toPosix(relative(MAP_ROOT, file)))
    .filter(page => page !== 'README.md')
    .sort();
}

/** Accept a source path, a map path, or a bare stem; return `agent/loop.md`. */
export function normalizeMapPath(input: string): string {
  let path = toPosix(input).replace(/^\.\//, '');
  if (path.startsWith('docs/map/')) path = path.slice('docs/map/'.length);
  else if (path.startsWith('src/')) path = path.slice('src/'.length);
  return `${path.replace(/\.ts$/, '').replace(/\.md$/, '')}.md`;
}

/**
 * `**` crosses separators, `*` and `?` do not. A pattern with no wildcard and no
 * `.md` is treated as a directory prefix, so `agent/` and `agent` both mean
 * `agent/**`.
 */
export function matchesGlob(pattern: string, page: string): boolean {
  let glob = toPosix(pattern).replace(/^\.\//, '');
  if (glob.startsWith('docs/map/')) glob = glob.slice('docs/map/'.length);
  if (!/[*?]/.test(glob) && !glob.endsWith('.md')) glob = `${glob.replace(/\/$/, '')}/**`;

  const regex = glob
    .split(/(\*\*|\*|\?)/)
    .map(part => {
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      if (part === '?') return '[^/]';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${regex}$`).test(page);
}

/** The section a query for `name` should return, matching any known spelling. */
export function findSection(page: ParsedPage, name: string): ParsedSection | undefined {
  const known = lookupSection(name);
  const wanted = normalizeSectionName(name);
  return page.sections.find(section =>
    known ? section.name === known.name : normalizeSectionName(section.name) === wanted,
  );
}
