import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/seed/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Bundle all dependencies so the runtime image only needs node + dist (no install step).
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
