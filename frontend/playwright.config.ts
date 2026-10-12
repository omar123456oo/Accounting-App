import { defineConfig } from '@playwright/test';

const PORT = 4300;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the installed Google Chrome, so no browser download is needed.
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
