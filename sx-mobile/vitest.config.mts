import path from 'node:path';
import { defineConfig } from 'vitest/config';

const stub = (p: string) => path.resolve(import.meta.dirname, p);

/**
 * Test logic thuần (lib/*) chạy trên Node — không dựng RN runtime.
 * Các native module bị alias sang stub để import chain không kéo theo Expo.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/sxBoardKpis.ts', 'src/lib/productionApi.ts'],
    },
  },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: stub('tests/stubs/rn.ts') },
      {
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: stub('tests/stubs/asyncStorage.ts'),
      },
      { find: /^expo-.*$/, replacement: stub('tests/stubs/empty.ts') },
    ],
  },
});
