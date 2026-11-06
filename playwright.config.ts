import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `rm -rf .pglite-e2e && pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PGLITE_DIR: ".pglite-e2e",
      FX_PROVIDER: "fixture",
      AI_MOCK: "1",
      DATABASE_URL: "",
      ANTHROPIC_API_KEY: "",
      RESEND_API_KEY: "",
      BOOTSTRAP_USERNAME: "e2e",
      BOOTSTRAP_PASSWORD: "e2e-password-123",
      SESSION_SECRET: "ZTJlLXNlc3Npb24tc2VjcmV0LW5vdC1mb3ItcHJvZHVjdGlvbg==",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      DEDUP_HMAC_KEY: "ZTJlLWRlZHVwLWhtYWMta2V5LW5vdC1mb3ItcHJvZA==",
      CRON_SECRET: "e2e-cron-secret",
      APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
