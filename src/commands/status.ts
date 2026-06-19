import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import { getDbSyncConfig } from '../providers/db.js';

export function runStatusCommand(): void {
  console.log();

  // API Keys
  const config = loadConfig();
  console.log(chalk.bold('API Keys'));
  for (const provider of PROVIDER_REGISTRY) {
    const envKey = process.env[provider.apiKeyEnvVar];
    const configKey = config.providers[provider.id]?.apiKey;
    if (envKey) {
      console.log(chalk.green(`  ${provider.name}:`) + chalk.gray(` env (${envKey.slice(0, 8)}...)`));
    } else if (configKey) {
      console.log(chalk.green(`  ${provider.name}:`) + chalk.gray(` config (${configKey.slice(0, 8)}...)`));
    } else {
      console.log(chalk.dim(`  ${provider.name}:`) + chalk.gray(' not set'));
    }
  }

  console.log();

  // Database
  const { syncUrl } = getDbSyncConfig();
  console.log(chalk.bold('Database'));
  if (syncUrl) {
    console.log(chalk.green('  Turso sync: configured'));
    console.log(chalk.dim(`  Remote: ${syncUrl}`));
  } else {
    console.log(chalk.yellow('  Turso sync: not configured') + chalk.dim(' (local-only)'));
    console.log(chalk.dim('  To enable: set FREECODE_DB_SYNC_URL + FREECODE_DB_AUTH_TOKEN, or add "db" to config.json'));
  }

  console.log();

  // Environment / Doppler
  const dopplerProject = process.env['DOPPLER_PROJECT'];
  const dopplerConfig = process.env['DOPPLER_CONFIG'];
  console.log(chalk.bold('Environment'));
  if (dopplerProject) {
    const configLabel = dopplerConfig ? ` / ${dopplerConfig}` : '';
    console.log(chalk.green(`  Doppler: active`) + chalk.dim(` (project: ${dopplerProject}${configLabel})`));
  } else {
    console.log(chalk.dim('  Doppler: not detected') + chalk.gray(' — vars loaded from shell environment'));
  }

  console.log();
}
