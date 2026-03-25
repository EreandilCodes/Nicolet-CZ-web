import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    // SQLite native module requires single-threaded execution
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
