import os from 'node:os';
import { defineConfig } from 'vitest/config';

// Vitest's default worker count re-reads `os.availableParallelism()` once per test
// file while grouping specs. On machines where the usable CPU count can change
// mid-run (phones isolating cores under thermal/game load, cgroup quota changes),
// two files in the same run resolve different worker counts and vitest aborts with
// "Projects have different 'maxWorkers' but same 'sequence.groupOrder'".
// Sampling the CPU count once here pins it for the whole run. The value is a
// snapshot taken at config load, and matches vitest's own default formula.
const maxWorkers = Math.max((os.availableParallelism?.() ?? os.cpus().length) - 1, 1);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    maxWorkers,
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
