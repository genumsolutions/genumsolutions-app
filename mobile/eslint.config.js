// =====================================================================
// eslint.config.js — lint the app the way the website lints itself.
//
// Why this exists: `tsc --noEmit` is happy to compile a function that never
// uses its props, an import nobody reads, or a branch nobody can reach, so
// dead admin props survived until someone spotted them by eye. The website
// already fails on those with ESLint; this config gives the app the same gate,
// both in the pre-commit hook (`npm run lint:check`) and in CI.
//
// Deliberately errors on unused variables/arguments. Prefix an argument with
// "_" when a signature needs the position but the body does not read it.
// =====================================================================
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const tseslint = require("@typescript-eslint/eslint-plugin");

module.exports = defineConfig([
  expoConfig,
  {
    // `// eslint-disable-next-line` comments for rules this config turns off
    // are not worth a warning on every run.
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // The point of this config: dead code and unused props fail the build.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Scope note: this gate exists to catch dead code. The react-hooks v6
      // advisories (set-state-in-effect, refs, immutability, static-components)
      // and the import/style rules would fail ~150 pre-existing sites, mostly in
      // the control hub — turning those into a refactor is a separate job, so
      // they stay off rather than drowning the signal.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off",
      "import/first": "off",
      "import/no-duplicates": "off",
      "@typescript-eslint/array-type": "off",
    },
  },
  {
    // Plain node scripts in this repo.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { Buffer: "readonly", process: "readonly", console: "readonly" },
    },
  },
  {
    // Deno edge functions import over https/jsr, which the resolver cannot see.
    files: ["supabase/functions/**/*.ts"],
    rules: { "import/no-unresolved": "off" },
  },
]);
