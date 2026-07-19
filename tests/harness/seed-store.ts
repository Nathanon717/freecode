import { createClient } from '@libsql/client';
import { createSchema } from '../../src/store/db-schema.js';

/** One model row a scenario wants present in its temp store before the CLI starts. */
export interface SeedModel {
  provider: string;
  modelId: string;
  displayName?: string;
}

/**
 * Write model rows into a scenario's temp store before the CLI is spawned.
 *
 * Scenarios normally start from an empty DB, which is fine because the CLI creates
 * whatever rows it needs. Startup behaviour that keys off *pre-existing* rows (the
 * blocklist purge prompt) can't be reached that way, so those scenarios seed here.
 * Uses the real schema so the seeded DB matches what the CLI opens.
 */
export async function seedModels(storeDir: string, models: SeedModel[]): Promise<void> {
  const client = createClient({ url: `file:${storeDir}/freecode.db` });
  try {
    await createSchema(client);
    await client.batch(
      models.map((m) => ({
        sql: 'INSERT INTO models (key, provider, model_id, display_name) VALUES (?, ?, ?, ?)',
        args: [`${m.provider}:${m.modelId}`, m.provider, m.modelId, m.displayName ?? m.modelId],
      })),
      'write',
    );
  } finally {
    client.close();
  }
}
