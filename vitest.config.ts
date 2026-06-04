import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { FREECODE_TRANSCRIPT_STREAM: 'null' },
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
