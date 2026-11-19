import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Most suites live in src/; the release-uploader contract (notes format
    // read by ota-guard) is a .mjs script, so it is tested in place as .mjs.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
