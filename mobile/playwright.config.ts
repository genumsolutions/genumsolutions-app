// =====================================================================
// playwright.config.ts — layout smoke test for the exported web bundle.
//
// Why this exists: the vitest suites can only prove what the source
// SAYS (this repo has no React Testing Library), and `expo export` only
// proves the bundle COMPILES. Neither catches a section that renders in
// the wrong place, collapses to zero height, or overflows the phone
// width. This runs the real bundle in Chromium at 390×844 and looks at it.
//
// Prerequisite: `dist/` must exist (npm run test:e2e builds it first).
// =====================================================================
import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  // A cold RN-web bundle plus two failing Supabase reads per screen; give
  // it room, but far less than a hang would need.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The layout we care about is the phone one.
    viewport: { width: 390, height: 844 },
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "node scripts/serve-web.mjs",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
