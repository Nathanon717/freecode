import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, readRawConfig, writeConfigFile } from '../config/index.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import { getOllamaModels } from '../providers/ollama.js';
import { testAllProviders } from '../providers/router.js';
import type { Config, ModelConfig, ProviderConfig } from '../providers/types.js';

interface ProviderStatus {
  providerId: string;
  providerName: string;
  ok: boolean;
  error?: string;
}

export interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
}

function modelPreference(item: ModelMenuItem): string {
  return `${item.providerId}:${item.modelId}`;
}

function savePreferredModel(model: string): void {
  const paths = getConfigPaths();
  const existing = readRawConfig(paths.globalPath) as Record<string, unknown> | null ?? {};
  delete existing['preferLocal'];
  writeConfigFile(paths.globalPath, {
    ...existing,
    preferredModel: model,
  } as Partial<Config>);
}

function addProviderModels(items: ModelMenuItem[], provider: ProviderConfig, models: ModelConfig[]): void {
  for (const model of models) {
    items.push({
      providerId: provider.id,
      providerName: provider.name,
      modelId: model.id,
      displayName: model.displayName,
    });
  }
}

export async function getSelectableModels(): Promise<ModelMenuItem[]> {
  const statuses = await testAllProviders();
  const statusMap = new Map<string, ProviderStatus>(statuses.map(status => [status.providerId, status]));
  const items: ModelMenuItem[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    if (statusMap.get(provider.id)?.ok) {
      addProviderModels(items, provider, provider.models);
    }
  }

  if (statusMap.get('ollama')?.ok) {
    const ollamaModels = await getOllamaModels();
    for (const model of ollamaModels) {
      items.push({
        providerId: 'ollama',
        providerName: 'Ollama (local)',
        modelId: model.id,
        displayName: model.displayName,
      });
    }
  }

  return items;
}

function buildScreen(items: ModelMenuItem[], selected: number, currentModel: string): string[] {
  const lines: string[] = [];
  let lastProvider = '';

  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Select model')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter select, Space select + default, Esc close')}`);
  lines.push('');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const preference = modelPreference(item);
    const active = i === selected;
    const current = preference === currentModel;

    if (item.providerId !== lastProvider) {
      if (lastProvider) lines.push('');
      lines.push(`  ${chalk.bold(item.providerName)}`);
      lastProvider = item.providerId;
    }

    const cursor = active ? chalk.cyan('>') : ' ';
    const label = `${item.providerId}:${item.modelId}`;
    const renderedLabel = active ? chalk.inverse(label) : chalk.cyan(label);
    const marker = current ? chalk.green(' current') : '';
    lines.push(`  ${cursor} ${renderedLabel} ${chalk.gray(`(${item.displayName})`)}${marker}`);
  }

  lines.push('');
  return lines;
}

export async function runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Model picker requires an interactive terminal.'));
    return;
  }

  console.log(chalk.dim('Loading available models...'));
  const items = await getSelectableModels();

  if (items.length === 0) {
    console.log(chalk.red('No configured providers or local models are available.'));
    return;
  }

  const currentIndex = items.findIndex(item => modelPreference(item) === currentModel);
  let selected = currentIndex >= 0 ? currentIndex : 0;
  let lineCount = 1;

  function redraw(): void {
    const lines = buildScreen(items, selected, currentModel);
    if (lineCount > 0) {
      process.stdout.write(`\x1b[${lineCount}A\r\x1b[J`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    lineCount = lines.length;
  }

  return new Promise<void>((resolve) => {
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?25l');

    redraw();

    const onData = (data: string): void => {
      if (data === '\x03') {
        cleanup();
        process.exit(0);
      }

      if (data === '\x1b') {
        cleanup();
        resolve();
        return;
      }

      if (data === '\x1b[A') {
        selected = (selected - 1 + items.length) % items.length;
        redraw();
        return;
      }

      if (data === '\x1b[B') {
        selected = (selected + 1) % items.length;
        redraw();
        return;
      }

      if (data === '\r' || data === '\n') {
        const choice = modelPreference(items[selected]);
        setSelectedModel(choice);
        cleanup();
        console.log(chalk.blue(`Model set to: ${choice}`));
        resolve();
      }

      if (data === ' ') {
        const choice = modelPreference(items[selected]);
        setSelectedModel(choice);
        savePreferredModel(choice);
        cleanup();
        console.log(chalk.blue(`Model set to: ${choice}`));
        console.log(chalk.green(`Default model set to: ${choice}`));
        resolve();
      }
    };

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1b[?25h');
      rl.resume();
    }

    process.stdin.on('data', onData);
  });
}
