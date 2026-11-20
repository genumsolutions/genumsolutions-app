// =====================================================================
// eslint.config.js — lint the app the way the website lints itself.
//
// Why this exists: `tsc --noEmit` is happy to compile a function that never
// uses its props, an import nobody reads, or a branch nobody can reach, so
// dead admin props survived until someone spotted them by eye. The website
// already fails on those with ESLint; this config gives the app the same gate,
// in CI (`npm run lint`) and, for the files in a commit, in the pre-commit hook.
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
      // The react-hooks v6+ advisories, on as errors. Upgraded the plugin to 7
      // for these: 5.2.0 only shipped rules-of-hooks and exhaustive-deps, so the
      // earlier "off" lines here named rules that did not exist yet.
      //
      // set-state-in-effect catches the cascade bug this repo keeps hitting —
      // an effect that mirrors a prop or another state into state, which renders
      // twice and can loop when the write feeds back. refs catches a ref read
      // during render (the value is one render stale). immutability catches
      // mutating props/state instead of replacing them. static-components
      // catches a component declared inside a component, which remounts its
      // subtree on every parent render. preserve-manual-memoization catches a
      // useMemo/useCallback whose dependencies no longer cover what it reads.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/static-components": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/exhaustive-deps": "error",
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
