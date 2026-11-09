import { defineConfig } from 'vitest/config';
import path from 'path';

// Integration tests run against a local Postgres database (never the .env DATABASE_URL)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://gnolasco@localhost:5433/boothgen_genie_test';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL, NEXT_PUBLIC_APP_URL: 'https://boothgen.test', R2_PUBLIC_URL: 'https://media.boothgen.test' },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
