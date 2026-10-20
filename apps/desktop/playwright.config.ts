import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: `./test-results/${randomUUID()}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: process.env.CI ? 90_000 : 30_000,
  reporter: 'list',
});
