import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/main/index.ts', 
    'src/preload/index.ts', 
    'src/main/workers/excelWorker.ts',
    'src/main/services/db-service/entry.ts',
    'src/main/services/db-service/client.ts'
  ],
  format: ['esm', 'cjs'],
  target: 'node20',
  clean: false, // Don't clean dist, handled by build script or we append to it
  outDir: 'dist',
  external: ['electron', 'dotenv', '@duckdb/node-api'],
  sourcemap: true,
  shims: true, // 为 ESM 注入 __dirname 等 shim
  dts: false,
})
