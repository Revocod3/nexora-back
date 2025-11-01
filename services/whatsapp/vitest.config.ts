import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Provide direct source aliases for workspace packages so we don't need a pre-build.
export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: {
      '@la/shared-config': path.resolve(__dirname, '../../../shared/config/src'),
      '@la/bus': path.resolve(__dirname, '../../../packages/bus/src'),
      '@la/contracts': path.resolve(__dirname, '../../../packages/contracts/src'),
      '@la/logger': path.resolve(__dirname, '../../../shared/logger/src'),
      '@la/shared-tracing': path.resolve(__dirname, '../../../shared/tracing/src'),
    },
  },
});
