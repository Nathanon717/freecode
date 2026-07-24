// check-tests: no-test — raw-key TTY prompt with no pure logic; covered end-to-end by the tty-blocklist-purge scenario
import chalk from 'chalk';
import { ensureStoreReady } from '../store/db.js';
import {
  findBlocklistedStoredModels,
  purgeBlocklistedStoredModels,
  type BlocklistedStoredModel,
} from '../providers/blocklist-purge.js';
import { runRawKeySession } from './menus/raw-picker.js';

function describe(model: BlocklistedStoredModel): string {
  const name = model.displayName && model.displayName !== model.modelId
    ? chalk.dim(` (${model.displayName})`)
    : '';
  return `  ${model.provider}:${model.modelId}${name}`;
}

/**
 * Print exactly what is about to be destroyed. The user's only lever over the
 * blocklists is editing `provider-catalog.ts`, so the list has to be specific
 * enough for them to recognise a model they did not mean to blocklist.
 */
function drawPrompt(models: BlocklistedStoredModel[]): void {
  const count = models.length;
  console.log(
    chalk.yellow(
      `\n${count} stored model${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} now blocklisted in the provider registry:`,
    ),
  );
  for (const model of models) console.log(describe(model));
  console.log(
    chalk.dim(
      '\nDeleting them also deletes their eval history, call log, and saved settings.',
    ),
  );
  console.log(
    chalk.dim('Enter to delete · close freecode to edit the blocklists instead'),
  );
}

/**
 * Offer to delete stored models that the registry blocklists now exclude, and delete
 * them if the user confirms.
 *
 * Interactive TTY sessions only: the delete is irreversible and the alternative is
 * "quit and edit the blocklist", neither of which a scripted or piped run can answer,
 * so those runs leave the rows alone. Quitting records nothing, so the prompt returns
 * on the next launch until the rows are deleted or the blocklist entry is removed.
 *
 * Runs before the footer UI is set up, so it can draw and read keys without contending
 * with the pinned status bar.
 */
export async function promptBlocklistPurge(): Promise<void> {
  if (!process.stdin.isTTY) return;
  await ensureStoreReady();
  const models = findBlocklistedStoredModels();
  if (models.length === 0) return;

  drawPrompt(models);

  // Enter is the only key that resolves. There is deliberately no dismiss key: the
  // alternative the prompt offers is editing the blocklists, which needs a restart
  // anyway, so a "continue without deleting" path would just be a third outcome the
  // hint does not mention. Ctrl-C quits, which is exactly the advertised escape.
  const session = runRawKeySession<void>({
    onKey(data) {
      if (data === '\r' || data === '\n') session.close(undefined);
    },
    onCtrlC() {
      process.stdin.pause();
      process.exit(0);
    },
    onClose() {
      process.stdin.pause();
    },
  });

  await session.promise;
  const durable = await purgeBlocklistedStoredModels(models);
  if (durable) {
    console.log(chalk.dim(`Deleted ${models.length} model${models.length === 1 ? '' : 's'}.\n`));
  } else {
    console.log(
      chalk.yellow(
        `Could not reach the sync server; ${models.length} model${models.length === 1 ? '' : 's'} will be deleted on the next launch.\n`,
      ),
    );
  }
}
