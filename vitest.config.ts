import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Cold TS-transform of heavy module graphs (e.g. the `ai` SDK pulled in by
    // src/agent/tools) can take several seconds under full-parallel CPU contention.
    // The default 5s testTimeout is too tight for tests that import such graphs.
    testTimeout: 15000,
    env: { FREECODE_TRANSCRIPT_STREAM: 'null' },
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
