#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../src/providers/registry.js';
import { SLASH_COMMANDS } from '../src/cli/slash-commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHECK = process.argv.includes('--check');

interface ScenarioDoc {
  file: string;
  name: string;
  description: string;
  requiresLlm: boolean;
  workspace?: string;
}

type CanonicalModelGroups = Record<string, string[]>;

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

function parseExistingProviderModelCells(content: string): Map<string, string> {
  const cells = new Map<string, string>();
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const columns = line.split('|').slice(1, -1).map(column => column.trim());
    if (columns.length < 8) continue;
    const id = columns[2].match(/^`([^`]+)`$/)?.[1];
    if (!id) continue;
    cells.set(id, columns[7]);
  }
  return cells;
}

function canonicalModelCells(): Map<string, string> {
  const cells = new Map<string, string>();
  const path = join(ROOT, 'canonical-models.json');
  if (!existsSync(path)) return cells;

  const groups = JSON.parse(readFileSync(path, 'utf-8')) as CanonicalModelGroups;
  const byProvider = new Map<string, string[]>();
  for (const entries of Object.values(groups)) {
    for (const entry of entries) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) continue;
      const providerId = entry.slice(0, colonIdx);
      const modelId = entry.slice(colonIdx + 1);
      const models = byProvider.get(providerId) ?? [];
      models.push(modelId);
      byProvider.set(providerId, models);
    }
  }

  for (const [providerId, models] of byProvider) {
    const provider = PROVIDER_REGISTRY.find(p => p.id === providerId);
    const exactBlocklist = new Set(provider?.modelIdExactBlocklist ?? []);
    const blocklist = provider?.modelIdBlocklist ?? [];
    const filtered = [...new Set(models)]
      .filter(id => !exactBlocklist.has(id))
      .filter(id => !blocklist.some(blocked => id.includes(blocked)))
      .sort((a, b) => a.localeCompare(b));
    cells.set(providerId, filtered.map(id => `\`${id}\``).join('<br>'));
  }

  return cells;
}

function providerReference(content: string): string {
  const existingModelCells = parseExistingProviderModelCells(content);
  const canonicalCells = canonicalModelCells();
  const rows = PROVIDER_REGISTRY.map((provider, index) => [
    String(index + 1),
    provider.name,
    `\`${provider.id}\``,
    provider.type,
    `\`${provider.apiKeyEnvVar}\``,
    provider.supportsTools === false ? 'No' : 'Yes',
    provider.paid ? 'Yes' : 'No',
    provider.models.length > 0
      ? formatModels(provider.models)
      : existingModelCells.get(provider.id) || canonicalCells.get(provider.id) || '',
  ]);

  return markdownTable(
    ['Order', 'Provider', 'ID', 'Type', 'API key env var', 'Tools', 'Paid', 'Models'],
    rows,
  );
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

function readScenarios(): ScenarioDoc[] {
  const scenariosDir = join(ROOT, 'tests', 'scenarios');
  return readdirSync(scenariosDir)
    .filter(file => file.endsWith('.scenario.json'))
    .sort()
    .map(file => {
      const scenario = JSON.parse(readFileSync(join(scenariosDir, file), 'utf-8')) as ScenarioDoc;
      return {
        file,
        name: scenario.name,
        description: scenario.description,
        requiresLlm: Boolean(scenario.requiresLlm),
        workspace: scenario.workspace ?? 'repo',
      };
    });
}

function scenarioReference(): string {
  const rows = readScenarios().map(scenario => [
    `\`${scenario.file}\``,
    `\`${scenario.name}\``,
    scenario.requiresLlm ? 'LLM eval' : 'Non-LLM verification',
    scenario.workspace ?? 'repo',
    scenario.description,
  ]);

  return markdownTable(['File', 'Name', 'Type', 'Workspace', 'Description'], rows);
}

function updateFile(path: string, update: (content: string) => string): boolean {
  const current = existsSync(join(ROOT, path)) ? readProjectFile(path) : '';
  const normalized = current.replace(/\r\n/g, '\n');
  const next = `${update(normalized).trimEnd()}\n`;
  if (current === next) return false;

  if (!CHECK) {
    writeProjectFile(path, next);
  }

  return true;
}

const updates: Array<[string, (content: string) => string]> = [
  ['docs/providers.md', content => replaceGeneratedSection(content, 'PROVIDERS', providerReference(content))],
  ['docs/commands.md', content => {
    const base = content || '# Commands\n\nReference docs for npm scripts and slash commands.\n';
    return replaceGeneratedSection(
      replaceGeneratedSection(base, 'NPM SCRIPTS', packageScriptReference()),
      'SLASH COMMANDS',
      slashCommandReference(),
    );
  }],
  ['docs/scenarios.md', content => {
    const base = content || [
      '# Scenarios',
      '',
      'Reference docs for verification and eval scenarios.',
      '',
      'This table is generated from `tests/scenarios/*.scenario.json`.',
      '',
    ].join('\n');
    return replaceGeneratedSection(base, 'SCENARIOS', scenarioReference());
  }],
];

await initDynamicProviders();

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
