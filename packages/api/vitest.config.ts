import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests spin up Postgres (Testcontainers) — give them room.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
