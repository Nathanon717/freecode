#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { PROVIDER_REGISTRY } from '../../src/providers/provider-registry.js';
import { SLASH_COMMANDS } from '../../src/cli/slash-commands.js';
import { readJsonFile } from '../../src/util/text-encoding.js';
import {
  listSourceFiles,
  mapPageForSource,
  renderExportsBlock,
  buildStructureBlock,
  EXPORTS_BEGIN,
  EXPORTS_END,
  STRUCTURE_BEGIN,
  STRUCTURE_END,
} from './map-exports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CHECK = process.argv.includes('--check');

interface E2eDoc {
  file: string;
  name: string;
  description: string;
  workspace?: string;
}

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function writeProjectFile(path: string, content: string): void {
  const fullPath = join(ROOT, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

function replaceGeneratedSection(content: string, name: string, generated: string): string {
  const start = `<!-- BEGIN GENERATED ${name} -->`;
  const end = `<!-- END GENERATED ${name} -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  const replacement = `${start}\n${generated.trimEnd()}\n${end}`;

  if (!pattern.test(content)) {
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${separator}${replacement}\n`;
  }

  return content.replace(pattern, replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ].join('\n');
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function formatModels(models: typeof PROVIDER_REGISTRY[number]['models']): string {
  return [...models]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(model => `\`${model.id}\``)
    .join('<br>');
}

// Model lists for live-fetch providers are captured in a committed snapshot so
// docs generation stays deterministic and machine-independent. Fetching live
// here would make the output depend on which API keys happen to be set and on
// each machine's model-cache. Refresh the snapshot deliberately with
// `npm run docs:refresh-models`.
function snapshotModelCells(): Map<string, string> {
  const cells = new Map<string, string>();
  const path = join(ROOT, 'src/providers/model-snapshot.json');
  if (!existsSync(path)) return cells;

  const snapshot = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string[]>;
  for (const [providerId, models] of Object.entries(snapshot)) {
    const ids = [...new Set(models)].sort((a, b) => a.localeCompare(b));
    cells.set(providerId, ids.map(id => `\`${id}\``).join('<br>'));
  }
  return cells;
}

function providerReference(): string {
  const snapshotCells = snapshotModelCells();
  const rows = PROVIDER_REGISTRY.map((provider, index) => [
    String(index + 1),
    provider.name,
    `\`${provider.id}\``,
    `\`${provider.apiKeyEnvVar}\``,
    provider.supportsTools === false ? 'No' : 'Yes',
    provider.paid ? 'Yes' : 'No',
    provider.models.length > 0
      ? formatModels(provider.models)
      : snapshotCells.get(provider.id) || '',
  ]);

  return markdownTable(
    ['Order', 'Provider', 'ID', 'API key env var', 'Tools', 'Paid', 'Models'],
    rows,
  );
}

function ptyQuickstartRef(): string {
  const src = readProjectFile('docs/pty-session.md').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const endIdx = lines.findIndex(line => line.trim() === '<!-- END PTY QUICKSTART -->');
  if (endIdx === -1) {
    throw new Error('docs/pty-session.md is missing the <!-- END PTY QUICKSTART --> marker');
  }
  // n = last non-empty content line before the end marker (1-indexed), so a
  // "read lines 1–n" reader never pulls the marker comment or a trailing blank.
  let contentIdx = endIdx - 1;
  while (contentIdx >= 0 && lines[contentIdx].trim() === '') contentIdx--;
  return `For usage only, read lines 1–${contentIdx + 1}.`;
}

function packageScriptReference(): string {
  const packageJson = JSON.parse(readProjectFile('package.json')) as { scripts?: Record<string, string> };
  const scripts = Object.entries(packageJson.scripts ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return markdownTable(
    ['Script', 'Command'],
    scripts.map(([name, command]) => [`\`npm run ${name}\``, `\`${command}\``]),
  );
}

function slashCommandReference(): string {
  return markdownTable(
    ['Command', 'Description'],
    SLASH_COMMANDS.map(({ command, description }) => [`\`${command}\``, description]),
  );
}

function readE2eTests(): E2eDoc[] {
  const e2eDir = join(ROOT, 'tests', 'e2e');
  return readdirSync(e2eDir)
    .filter(file => file.endsWith('.e2e.json'))
    .sort()
    .map(file => {
      const e2eTest = readJsonFile<E2eDoc>(join(e2eDir, file));
      return {
        file,
        name: e2eTest.name,
        description: e2eTest.description,
        workspace: e2eTest.workspace ?? 'repo',
      };
    });
}

function e2eReference(): string {
  const rows = readE2eTests().map(e2eTest => [
    `\`${e2eTest.file}\``,
    `\`${e2eTest.name}\``,
    e2eTest.workspace ?? 'repo',
    e2eTest.description,
  ]);

  return markdownTable(['File', 'Name', 'Workspace', 'Description'], rows);
}

function updateFile(path: string, update: (content: string) => string): boolean {
  const current = existsSync(join(ROOT, path)) ? readProjectFile(path) : '';
  const normalized = current.replace(/\r\n/g, '\n');
  const next = `${update(normalized).replace(/\r\n/g, '\n').trimEnd()}\n`;
  if (normalized === next) return false;

  if (!CHECK) {
    writeProjectFile(path, next);
  }

  return true;
}

const updates: Array<[string, (content: string) => string]> = [
  ['docs/providers.md', content => replaceGeneratedSection(content, 'PROVIDERS', providerReference())],
  ['docs/commands.md', content => {
    const base = content || '# Commands\n\nReference docs for npm scripts and slash commands.\n';
    return replaceGeneratedSection(
      replaceGeneratedSection(base, 'NPM SCRIPTS', packageScriptReference()),
      'SLASH COMMANDS',
      slashCommandReference(),
    );
  }],
  ['docs/e2e.md', content => {
    const base = content || [
      '# E2e Tests',
      '',
      'Reference docs for e2e tests.',
      '',
      'This table is generated from `tests/e2e/*.e2e.json`.',
      '',
    ].join('\n');
    return replaceGeneratedSection(base, 'E2E', e2eReference());
  }],
  ['docs/README.md', content =>
    replaceGeneratedSection(content, 'PTY QUICKSTART REF', ptyQuickstartRef())],
];

function replaceMarkerSection(content: string, begin: string, end: string, block: string): string {
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
  return pattern.test(content) ? content.replace(pattern, block) : content;
}

// Maintain the generated EXPORTS block on every map page that has the markers.
for (const srcAbs of listSourceFiles()) {
  const pageRel = relative(ROOT, mapPageForSource(srcAbs)).replace(/\\/g, '/');
  if (!existsSync(join(ROOT, pageRel))) continue;
  updates.push([pageRel, content =>
    replaceMarkerSection(content, EXPORTS_BEGIN, EXPORTS_END, renderExportsBlock(srcAbs))]);
}

// Maintain the generated structure tree in the map README.
updates.push(['docs/map/README.md', content => {
  const block = buildStructureBlock();
  if (content.includes(STRUCTURE_BEGIN)) {
    return replaceMarkerSection(content, STRUCTURE_BEGIN, STRUCTURE_END, block);
  }
  return content.replace(/## Structure\n\n```text\n[\s\S]*?\n```/, `## Structure\n\n${block}`);
}]);

const changed = updates
  .map(([path, update]) => ({ path, changed: updateFile(path, update) }))
  .filter(result => result.changed);

if (CHECK && changed.length > 0) {
  console.error('Generated docs are stale:');
  for (const { path } of changed) {
    console.error(`  - ${relative(ROOT, join(ROOT, path))}`);
  }
  console.error('Run npm run docs:generate and commit the result.');
  process.exit(1);
}

if (!CHECK) {
  if (changed.length === 0) {
    console.log('Generated docs are already current.');
  } else {
    console.log('Updated generated docs:');
    for (const { path } of changed) {
      console.log(`  - ${relative(ROOT, join(ROOT, path))}`);
    }
  }
}
