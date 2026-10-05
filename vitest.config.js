import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    globalSetup: ['tests/globalSetup.js'],
    fileParallelism: false,          // all files share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
});
