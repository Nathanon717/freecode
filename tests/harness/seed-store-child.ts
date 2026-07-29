#!/usr/bin/env tsx
/**
 * Child half of `seedModels` — writes the seed rows, then exits.
 *
 * Runs as its own process on purpose: a libSQL client keeps the db file open on
 * Windows until GC, so seeding in the harness process makes the later
 * `rmSync(tmpStore)` fail with EPERM. See seed-store.ts.
 *
 * argv: <storeDir> <models JSON>
 */
import { createClient } from '@libsql/client';
import { createSchema } from '../../src/store/db-schema.js';
import type { SeedModel } from './seed-store.js';

const [storeDir, modelsJson] = process.argv.slice(2);
const models = JSON.parse(modelsJson) as SeedModel[];

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
