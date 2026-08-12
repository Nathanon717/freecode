#!/usr/bin/env tsx
/**
 * Query the codebase map by section.
 *
 * The map is 115 pages of structured markdown; without this you either read a
 * whole page to get one field, or grep and hope. Every verb addresses sections
 * through the manifest in `map-sections.ts`, so all spellings in the corpus
 * answer to their canonical name.
 *
 * Usage:
 *   npm run map -- role <glob>            one line per page, no bodies
 *   npm run map -- exports <file>
 *   npm run map -- section <name> <glob>
 *   npm run map -- sections <file>        enumerate headings, including the tail
 *   npm run map -- neighbors-of <file>    inverse: who names this file
 *                        [--format md|json]
 *
 * A <file> is any of `src/agent/loop.ts`, `agent/loop.md` or `agent/loop`. A
 * <glob> takes the first two, plus patterns over map-relative paths: `**` is
 * every page, `agent/` is a directory prefix, `*` stops at a path separator.
 * A bare stem is a directory to a glob, never a page.
 */
import { readFileSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
import {
  MAP_ROOT,
  findSection,
  listMapPages,
  matchesGlob,
  normalizeMapPath,
  parseMapPage,
  type ParsedPage,
} from './map-sections.js';

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

const pageCache = new Map<string, ParsedPage>();

function loadPage(page: string): ParsedPage {
  const cached = pageCache.get(page);
  if (cached) return cached;
  const parsed = parseMapPage(page, readFileSync(join(MAP_ROOT, page), 'utf-8'));
  pageCache.set(page, parsed);
  return parsed;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Pages matching a glob. An empty result is a typo, not an answer. */
function selectPages(pattern: string): string[] {
  const pages = listMapPages().filter(page => matchesGlob(pattern, page));
  if (pages.length === 0) fail(`No map page matches ${pattern}.`);
  return pages;
}

/** A single page, verified to exist. */
function selectPage(input: string): string {
  const page = normalizeMapPath(input);
  const pages = listMapPages();
  if (!pages.includes(page)) fail(`No map page at docs/map/${page}.`);
  return page;
}

/** Presentation only — a size cap must be measured against the raw body, not this. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface Emitter {
  json: unknown;
  md: string[];
}

function emit(format: string, out: Emitter): void {
  if (format === 'json') console.log(JSON.stringify(out.json, null, 2));
  else console.log(out.md.join('\n'));
}

function cmdRole(format: string, pattern: string): void {
  const rows = selectPages(pattern).map(page => {
    const role = findSection(loadPage(page), 'Role');
    return { page, role: role ? oneLine(role.body) : null };
  });
  emit(format, {
    json: rows,
    md: rows.map(row => (row.role ? `- \`${row.page}\` — ${row.role}` : `- \`${row.page}\` — (no Role)`)),
  });
}

function cmdSection(format: string, name: string, pattern: string): void {
  const rows = selectPages(pattern).flatMap(page => {
    const section = findSection(loadPage(page), name);
    return section ? [{ page, name: section.name, body: section.body }] : [];
  });
  emit(format, {
    json: rows,
    md: rows.flatMap(row => [`## \`${row.page}\``, '', row.body, '']),
  });
}

function cmdSections(format: string, file: string): void {
  const page = loadPage(selectPage(file));
  const rows = page.sections.map(section => ({
    name: section.name,
    raw: section.raw,
    status: section.status,
    syntax: section.syntax,
    line: section.line,
    lines: section.body === '' ? 0 : section.body.split('\n').length,
  }));
  emit(format, {
    json: { page: page.path, title: page.title, preamble: page.preamble, sections: rows },
    md: [
      `# \`${page.path}\` — ${page.title}`,
      ...(page.preamble ? ['', `preamble (unassigned prose): ${oneLine(page.preamble).slice(0, 80)}`] : []),
      '',
      ...rows.map(row => {
        const spelling = row.raw === row.name ? '' : ` (written "${row.raw}")`;
        return `- ${row.name} — ${row.status}, ${row.lines} line(s), L${row.line}${spelling}`;
      }),
    ],
  });
}

interface Reference {
  from: string;
  section: string;
  text: string;
  /** The link text names a different page than the link goes to — stale prose. */
  staleText: string | null;
}

const LINK = /!?\[([^\]]*)]\(([^)]+)\)/g;

/** Resolve a relative markdown link from `page` to a map-relative path, or null. */
function resolveLink(page: string, href: string): string | null {
  const raw = href.trim().split(/\s+/)[0].replace(/^<|>$/g, '').split('#')[0];
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || !raw.endsWith('.md')) return null;
  return toPosix(relative(MAP_ROOT, resolve(MAP_ROOT, dirname(page), raw)));
}

/**
 * Who links to this page — every section plus the preamble, not just Neighbors.
 *
 * Resolution goes through the link *target*, never the link text: a page can
 * carry a stale path in the text and a correct one in the target, and reporting
 * that disagreement is half the point of the verb.
 */
function cmdNeighborsOf(format: string, file: string): void {
  const wanted = selectPage(file);
  const refs: Reference[] = [];

  for (const page of listMapPages()) {
    if (page === wanted) continue;
    const parsed = loadPage(page);
    const blocks = [
      ...(parsed.preamble ? [{ name: '(preamble)', body: parsed.preamble }] : []),
      ...parsed.sections,
    ];
    for (const block of blocks) {
      for (const match of block.body.matchAll(LINK)) {
        if (resolveLink(page, match[2]) !== wanted) continue;
        // Link text that names a page is either the map-relative path (a label,
        // fine) or a relative one (must resolve to the same page). Anything else
        // is prose that moved on without its link.
        const text = match[1].trim();
        const stale =
          text.endsWith('.md') && text !== wanted && resolveLink(page, text) !== wanted;
        refs.push({ from: page, section: block.name, text, staleText: stale ? text : null });
      }
    }
  }

  emit(format, {
    json: { page: wanted, references: refs },
    md: refs.length === 0
      ? [`No map page links to \`${wanted}\`.`]
      : refs.map(
          ref =>
            `- \`${ref.from}\` § ${ref.section}` +
            (ref.staleText ? ` — link text says "${ref.staleText}"` : ''),
        ),
  });
}

function cmdExports(format: string, file: string): void {
  const page = loadPage(selectPage(file));
  const section = findSection(page, 'Exports');
  if (!section) fail(`docs/map/${page.path} has no Exports section.`);
  emit(format, { json: { page: page.path, body: section.body }, md: [section.body] });
}

const argv = process.argv.slice(2);
const formatIndex = argv.indexOf('--format');
const format = formatIndex === -1 ? 'md' : argv[formatIndex + 1];
const args = formatIndex === -1 ? argv : [...argv.slice(0, formatIndex), ...argv.slice(formatIndex + 2)];

if (format !== 'md' && format !== 'json') fail(`Unknown --format ${format}. Use md or json.`);

const [verb, ...rest] = args;

switch (verb) {
  case 'role':
    if (rest.length !== 1) fail('Usage: npm run map -- role <glob>');
    cmdRole(format, rest[0]);
    break;
  case 'exports':
    if (rest.length !== 1) fail('Usage: npm run map -- exports <file>');
    cmdExports(format, rest[0]);
    break;
  case 'section':
    if (rest.length !== 2) fail('Usage: npm run map -- section <name> <glob>');
    cmdSection(format, rest[0], rest[1]);
    break;
  case 'sections':
    if (rest.length !== 1) fail('Usage: npm run map -- sections <file>');
    cmdSections(format, rest[0]);
    break;
  case 'neighbors-of':
    if (rest.length !== 1) fail('Usage: npm run map -- neighbors-of <file>');
    cmdNeighborsOf(format, rest[0]);
    break;
  default:
    fail(
      'Usage: npm run map -- <verb> [args] [--format md|json]\n' +
        '  role <glob>            one line per page, no bodies\n' +
        '  exports <file>\n' +
        '  section <name> <glob>\n' +
        '  sections <file>        enumerate headings, including the tail\n' +
        '  neighbors-of <file>    inverse: who names this file',
    );
}
