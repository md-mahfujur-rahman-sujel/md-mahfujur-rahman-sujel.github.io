const { defineConfig } = require('@playwright/test');

// Overridable so a suite can run while `npm run dev` holds the default port.
const PORT = Number(process.env.TEST_PORT || 8765);

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    headless: true,
    // Trace zips intermittently fail to close on Windows drives; keep them for CI only.
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `node scripts/serve.cjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Own the server so a stale process can never serve half a run.
    reuseExistingServer: false,
    timeout: 30000
  }
});
