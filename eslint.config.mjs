import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Storage calls became async when reports and accounts moved to the KV
    // driver. `tsc` accepts a dropped `await` — `if (!findAccountById(id))` is
    // always false against a Promise, and an un-awaited `recordUnlock` can lose
    // a paid unlock when the serverless invocation ends. Type-aware linting is
    // the only thing that catches these.
    files: ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts"],
    ignores: ["lib/*-fixtures.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
]);

export default eslintConfig;
