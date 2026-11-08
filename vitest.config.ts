import { defineConfig } from 'vitest/config';

// Logic tests only (Playwright specs live in e2e/ and run with `npm run e2e`).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
