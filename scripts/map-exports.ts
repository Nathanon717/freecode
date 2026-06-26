import ts from 'typescript';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_ROOT = join(ROOT, 'src');

let cachedProgram: ts.Program | null = null;

function getProgram(): ts.Program {
  if (cachedProgram) return cachedProgram;
  const configPath = join(ROOT, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
  cachedProgram = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
  });
  return cachedProgram;
}

function stripLeadingKeywords(text: string): string {
  return text.replace(/^export\s+(default\s+)?/, '').replace(/^declare\s+/, '');
}

/** Strip machine-specific `import("/abs/path").` prefixes the checker emits for inferred types. */
function stripImportPaths(text: string): string {
  return text.replace(/import\((?:"[^"]*"|'[^']*')\)\./g, '');
}

/** Render a class declaration: keep member signatures, drop method bodies. */
function renderClass(decl: ts.ClassDeclaration, checker: ts.TypeChecker): string {
  const name = decl.name?.getText() ?? '';
  const typeParams = decl.typeParameters
    ? `<${decl.typeParameters.map((p) => p.getText()).join(', ')}>`
    : '';
  const heritage = decl.heritageClauses
    ? ' ' + decl.heritageClauses.map((h) => h.getText()).join(' ')
    : '';
  const members: string[] = [];
  for (const member of decl.members) {
    if (
      ts.isMethodDeclaration(member) ||
      ts.isConstructorDeclaration(member) ||
      ts.isGetAccessor(member) ||
      ts.isSetAccessor(member)
    ) {
      const sig = checker.getSignatureFromDeclaration(member);
      const text = sig ? checker.signatureToString(sig) : member.getText();
      const mName = ts.isConstructorDeclaration(member)
        ? 'constructor'
        : member.name?.getText() ?? '';
      const prefix = ts.isGetAccessor(member) ? 'get ' : ts.isSetAccessor(member) ? 'set ' : '';
      members.push(`  ${prefix}${mName}${text.replace(/^[^(]*/, '')};`);
    } else if (ts.isPropertyDeclaration(member)) {
      members.push(`  ${member.getText().replace(/\s*=.*$/s, '').replace(/;?$/, ';')}`);
    }
  }
  return `class ${name}${typeParams}${heritage} {\n${members.join('\n')}\n}`;
}

/** True if the symbol originates from another module (via `export *` or `export { x } from`). */
function isReExported(sym: ts.Symbol, sourceFile: ts.SourceFile): boolean {
  const decls = sym.getDeclarations();
  if (!decls || decls.length === 0) return false;
  const decl = decls[0];
  // `export { x } from './y'`: the specifier lives in this file but re-exports elsewhere.
  if (ts.isExportSpecifier(decl) && decl.parent.parent.moduleSpecifier) return true;
  // `export * from './y'`: the underlying declaration lives in another source file.
  return decl.getSourceFile() !== sourceFile;
}

function sourcePos(sym: ts.Symbol): number {
  const decl = sym.getDeclarations()?.[0];
  return decl ? decl.getStart() : Number.MAX_SAFE_INTEGER;
}

function renderSymbol(sym: ts.Symbol, checker: ts.TypeChecker): string | null {
  const decls = sym.getDeclarations();
  if (!decls || decls.length === 0) return null;
  const decl = decls[0];
  const name = sym.getName();

  // Interfaces / type aliases / enums: emit explicit source text (full body).
  if (
    ts.isInterfaceDeclaration(decl) ||
    ts.isTypeAliasDeclaration(decl) ||
    ts.isEnumDeclaration(decl)
  ) {
    // Merge multiple interface declarations under one name.
    return decls
      .map((d) => stripLeadingKeywords(d.getText()))
      .join('\n');
  }

  if (ts.isClassDeclaration(decl)) {
    return renderClass(decl, checker);
  }

  // Re-export of a namespace / module
  if (ts.isExportSpecifier(decl) || ts.isNamespaceExport(decl)) {
    const type = checker.getTypeOfSymbolAtLocation(sym, decl);
    return `${name}: ${checker.typeToString(type)}`;
  }

  const type = checker.getTypeOfSymbolAtLocation(sym, decl);
  const callSigs = type.getCallSignatures();
  if (callSigs.length > 0) {
    return callSigs
      .map((sig) => `${name}${checker.signatureToString(sig)}`)
      .join('\n');
  }

  const typeStr = checker.typeToString(
    type,
    decl,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
  );
  return `${name}: ${typeStr}`;
}

export function extractExports(srcAbsPath: string): string {
  const program = getProgram();
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(srcAbsPath);
  if (!sourceFile) return '';
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return '';
  // Re-export barrels: emit the `export … from './x'` lines verbatim rather than
  // expanding every foreign symbol (which would duplicate the owning page).
  const reExportLines: string[] = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      reExportLines.push(stmt.getText().replace(/;$/, ''));
    }
  }

  const exportsOfModule = checker.getExportsOfModule(moduleSymbol);
  const ordered = [...exportsOfModule].sort((a, b) => sourcePos(a) - sourcePos(b));
  const parts: string[] = [...reExportLines];
  for (const sym of ordered) {
    if (isReExported(sym, sourceFile)) continue;
    const rendered = renderSymbol(sym, checker);
    if (rendered) parts.push(stripImportPaths(rendered));
  }
  return parts.join('\n\n');
}

export const EXPORTS_BEGIN = '<!-- BEGIN GENERATED EXPORTS -->';
export const EXPORTS_END = '<!-- END GENERATED EXPORTS -->';
export const STRUCTURE_BEGIN = '<!-- BEGIN GENERATED MAP STRUCTURE -->';
export const STRUCTURE_END = '<!-- END GENERATED MAP STRUCTURE -->';

/** The full generated Exports block (heading + fence) for one source file. */
export function renderExportsBlock(srcAbsPath: string): string {
  const body = extractExports(srcAbsPath);
  const inner = body.trim().length > 0
    ? `\`\`\`typescript\n${body.trim()}\n\`\`\``
    : '_No exported symbols._';
  return `${EXPORTS_BEGIN}\n## Exports\n\n${inner}\n${EXPORTS_END}`;
}

export const MAP_ROOT = join(ROOT, 'docs', 'map');

export function listSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && full.endsWith('.ts')) out.push(full);
    }
  };
  walk(SRC_ROOT);
  return out.sort();
}

/** Absolute path of the map page that documents a given source file. */
export function mapPageForSource(srcAbsPath: string): string {
  return join(MAP_ROOT, relative(SRC_ROOT, srcAbsPath).replace(/\.ts$/, '.md'));
}

/** Posix path of a map page relative to docs/map (the link target form check-map expects). */
export function mapLinkForSource(srcAbsPath: string): string {
  return relative(SRC_ROOT, srcAbsPath).replace(/\.ts$/, '.md').replace(/\\/g, '/');
}

/** The descriptive label from a map page's H1 (`# src/x.ts - Label` -> `Label`). */
export function pageLabel(mapAbsPath: string): string {
  if (!existsSync(mapAbsPath)) return '';
  const first = readFileSync(mapAbsPath, 'utf-8').split('\n').find((l) => l.startsWith('# '));
  if (!first) return '';
  // Strip a leading `src/path.ts` plus separator, tolerating both `-` and `—`.
  return first.slice(2).trim().replace(/^src\/\S+\.ts\s*[-—]?\s*/, '').trim();
}

/** Generated, directory-grouped structure tree + nav links for docs/map/README.md. */
export function buildStructureBlock(): string {
  const files = listSourceFiles();
  const lines: string[] = [STRUCTURE_BEGIN];
  let lastDir = '';
  for (const file of files) {
    const link = mapLinkForSource(file);
    const dir = link.includes('/') ? link.slice(0, link.lastIndexOf('/')) : '';
    if (dir !== lastDir) {
      if (dir !== '') lines.push(`- \`src/${dir}/\``);
      lastDir = dir;
    }
    const indent = dir === '' ? '' : '  ';
    const base = link.slice(link.lastIndexOf('/') + 1).replace(/\.md$/, '.ts');
    const label = pageLabel(mapPageForSource(file));
    lines.push(`${indent}- [\`${base}\`](${link})${label ? ` — ${label}` : ''}`);
  }
  lines.push(STRUCTURE_END);
  return lines.join('\n');
}
