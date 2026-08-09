/**
 * The derived half of a map page: which files a module sits between, what
 * tests cover it, how much of its line budget is spent, and which environment
 * variables it reads.
 *
 * All four sections live inside one marker pair. That keeps their order
 * structural rather than a rule someone has to remember, and it lets `Env`
 * vanish entirely on the ~95 pages whose module reads no environment.
 *
 * Neighbors are ranked, not listed: each edge carries how many times the
 * importing file actually mentions the names it imported, so the file a module
 * leans on is at the top and the one it touches once is at the bottom.
 */
import ts from 'typescript';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { getProgram, listSourceFiles, mapPageForSource } from './map-exports.js';
import { MAX_LINES, countLines } from '../checks/line-budget.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(ROOT, 'src');
const TESTS_ROOT = join(ROOT, 'tests');

export const FACTS_BEGIN = '<!-- BEGIN GENERATED MAP FACTS -->';
export const FACTS_END = '<!-- END GENERATED MAP FACTS -->';

/**
 * Longest lists a generated section may print, with the remainder collapsed to
 * `+n more`. The map exists to save tokens, so an unbounded list of the 30-odd
 * files that import `logger.ts` would cost more than it tells anyone.
 */
const MAX_IMPORTS = 12;
const MAX_IMPORTED_BY = 8;

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Source path relative to `src/`, the label form used in neighbor links. */
function srcLabel(srcAbsPath: string): string {
  return toPosix(relative(SRC_ROOT, srcAbsPath));
}

/** Link from one map page to another, relative to the linking page's directory. */
function mapLink(fromSrc: string, toSrc: string): string {
  const from = dirname(mapPageForSource(fromSrc));
  return toPosix(relative(from, mapPageForSource(toSrc)));
}

/**
 * Resolve a relative import to the `src/` file it names, or null.
 *
 * Node16 resolution means every intra-source import is written `./x.js`, so a
 * specifier that does not end in `.js` is a JSON import or a package — not a
 * neighbor, and emitting a link for it would point at a map page that will
 * never exist.
 */
function resolveSrcImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.') || !specifier.endsWith('.js')) return null;
  const resolved = join(dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
  if (!resolved.startsWith(SRC_ROOT) || !existsSync(resolved)) return null;
  return resolved;
}

/** Every identifier in the file, by name, excluding the import/export clauses themselves. */
function identifierCounts(sourceFile: ts.SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return counts;
}

/** The local names an import clause binds, which are what the file then references. */
function importedNames(clause: ts.ImportClause | undefined): string[] {
  if (!clause) return [];
  const names: string[] = [];
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name.text);
    else for (const element of clause.namedBindings.elements) names.push(element.name.text);
  }
  return names;
}

/**
 * How much of another module a re-export carries across — the barrel's version
 * of a reference count. `export { a, b } from` is two names; `export *` is
 * however many the other module has. Without this a pure barrel reports no
 * neighbors at all, on exactly the page where the edges are the whole content.
 */
function reExportWidth(statement: ts.ExportDeclaration, target: string, program: ts.Program): number {
  const clause = statement.exportClause;
  if (clause && ts.isNamedExports(clause)) return clause.elements.length;

  const targetFile = program.getSourceFile(target);
  if (!targetFile) return 1;
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(targetFile);
  return symbol ? checker.getExportsOfModule(symbol).length : 1;
}

export interface Edge {
  file: string;
  weight: number;
}

interface Graph {
  imports: Map<string, Edge[]>;
  importedBy: Map<string, Edge[]>;
}

let cachedGraph: Graph | null = null;

/**
 * The whole intra-`src/` import graph in one pass. Built once: re-walking the
 * program per page would turn `docs:generate` from seconds into minutes.
 */
function buildGraph(): Graph {
  if (cachedGraph) return cachedGraph;
  const program = getProgram();
  const imports = new Map<string, Edge[]>();
  const importedBy = new Map<string, Edge[]>();

  for (const srcAbs of listSourceFiles()) {
    const sourceFile = program.getSourceFile(srcAbs);
    if (!sourceFile) continue;
    const counts = identifierCounts(sourceFile);
    const weights = new Map<string, number>();

    for (const statement of sourceFile.statements) {
      const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ? statement.moduleSpecifier
        : undefined;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const target = resolveSrcImport(srcAbs, specifier.text);
      if (!target) continue;
      const weight = ts.isImportDeclaration(statement)
        ? importedNames(statement.importClause).reduce((sum, name) => sum + (counts.get(name) ?? 0), 0)
        : reExportWidth(statement, target, program);
      weights.set(target, (weights.get(target) ?? 0) + weight);
    }

    const edges = [...weights].map(([file, weight]) => ({ file, weight }));
    imports.set(srcAbs, sortEdges(edges));
    for (const edge of edges) {
      const inbound = importedBy.get(edge.file) ?? [];
      inbound.push({ file: srcAbs, weight: edge.weight });
      importedBy.set(edge.file, inbound);
    }
  }

  for (const [file, edges] of importedBy) importedBy.set(file, sortEdges(edges));
  cachedGraph = { imports, importedBy };
  return cachedGraph;
}

/** Heaviest edge first; path order breaks ties so output is stable. */
function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file));
}

export function neighborsOf(srcAbsPath: string): { imports: Edge[]; importedBy: Edge[] } {
  const graph = buildGraph();
  return {
    imports: graph.imports.get(srcAbsPath) ?? [],
    importedBy: graph.importedBy.get(srcAbsPath) ?? [],
  };
}

function renderEdges(srcAbsPath: string, edges: Edge[], cap: number): string {
  const shown = edges.slice(0, cap).map(
    edge => `[\`${srcLabel(edge.file)}\`](${mapLink(srcAbsPath, edge.file)}) ×${edge.weight}`,
  );
  const hidden = edges.length - shown.length;
  return shown.join(', ') + (hidden > 0 ? `, +${hidden} more` : '');
}

function renderNeighbors(srcAbsPath: string): string {
  const { imports, importedBy } = neighborsOf(srcAbsPath);
  const lines: string[] = [];
  if (imports.length > 0) lines.push(`- **Imports:** ${renderEdges(srcAbsPath, imports, MAX_IMPORTS)}`);
  if (importedBy.length > 0) {
    lines.push(`- **Imported by:** ${renderEdges(srcAbsPath, importedBy, MAX_IMPORTED_BY)}`);
  }
  return lines.length > 0 ? lines.join('\n') : '_Nothing under `src/` on either side._';
}

function walkFiles(dir: string, predicate: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, predicate);
    if (!entry.isFile() || !predicate(fullPath)) return [];
    return [fullPath];
  });
}

let cachedTestRefs: Map<string, number> | null = null;

/**
 * How many test files name each source file, counting any quoted path that
 * resolves into `src/` — `vi.mock('../../src/x.js')` is as much coverage as an
 * import, and both are written the same way.
 */
function testReferenceCounts(): Map<string, number> {
  if (cachedTestRefs) return cachedTestRefs;
  const counts = new Map<string, number>();
  for (const testFile of walkFiles(TESTS_ROOT, file => file.endsWith('.test.ts'))) {
    const content = readFileSync(testFile, 'utf-8');
    const named = new Set<string>();
    for (const match of content.matchAll(/['"](\.[^'"]*\.js)['"]/g)) {
      const target = resolveSrcImport(testFile, match[1]);
      if (target) named.add(target);
    }
    for (const target of named) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  cachedTestRefs = counts;
  return counts;
}

const NO_TEST_EXEMPT = /\/\/\s*check-tests:\s*no-test\b(.*)$/m;

/**
 * The mirrored unit test named, everything else counted.
 *
 * Listing all 30 test files that touch `logger.ts` would cost more tokens than
 * the page saves; the count still says whether the module is exercised widely.
 */
function renderTests(srcAbsPath: string): string {
  const mirrored = join(TESTS_ROOT, relative(SRC_ROOT, srcAbsPath).replace(/\.ts$/, '.test.ts'));
  const others = (testReferenceCounts().get(srcAbsPath) ?? 0) - (existsSync(mirrored) ? 1 : 0);
  const rest = others > 0
    ? ` ${others} other test ${others === 1 ? 'file references' : 'files reference'} it.`
    : '';

  if (existsSync(mirrored)) return `\`${toPosix(relative(ROOT, mirrored))}\`.${rest}`;

  const exempt = readFileSync(srcAbsPath, 'utf-8').match(NO_TEST_EXEMPT);
  const reason = exempt ? exempt[1].replace(/^[\s—:-]+/, '').trim() : '';
  return `No mirrored test${reason ? ` — ${reason}` : ''}.${rest}`;
}

function renderBudget(srcAbsPath: string): string {
  const lines = countLines(readFileSync(srcAbsPath, 'utf-8'));
  return `${lines} / ${MAX_LINES} lines (${MAX_LINES - lines} to spare).`;
}

/**
 * Environment variables the module reads, from the AST rather than a grep, so
 * a name mentioned in a comment is not reported as a dependency. Computed
 * lookups (`process.env[provider.apiKeyEnvVar]`) have no name to report and
 * are skipped.
 */
function envVars(srcAbsPath: string): string[] {
  const sourceFile = getProgram().getSourceFile(srcAbsPath);
  if (!sourceFile) return [];
  const names = new Set<string>();

  const isProcessEnv = (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env';

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      names.add(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      names.add(node.argumentExpression.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return [...names].sort();
}

/** Every generated section below `Exports`, as one replaceable block. */
export function renderFactsBlock(srcAbsPath: string): string {
  const sections = [
    `## Neighbors\n\n${renderNeighbors(srcAbsPath)}`,
    `## Tests\n\n${renderTests(srcAbsPath)}`,
    `## Budget\n\n${renderBudget(srcAbsPath)}`,
  ];
  const env = envVars(srcAbsPath);
  if (env.length > 0) sections.push(`## Env\n\n${env.map(name => `\`${name}\``).join(', ')}`);
  return `${FACTS_BEGIN}\n${sections.join('\n\n')}\n${FACTS_END}`;
}
