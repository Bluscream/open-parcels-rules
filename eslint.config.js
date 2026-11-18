// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "vendor/**",
      "python/**",
      // Type-checked against dist/ by the smoke test, after the build.
      "test/consumer/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Size limits from the coding rules: enforced mechanically, never by eye.
      "max-lines": ["error", { max: 1000, skipBlankLines: false, skipComments: false }],
      "max-lines-per-function": ["error", { max: 200, skipBlankLines: false, skipComments: false }],
      "max-depth": ["error", 3],
      "max-params": ["error", 5],
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // `const { tests: _, ...rest } = file` is the idiomatic way to drop a key.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      "no-restricted-syntax": [
        "error",
        { selector: "TSEnumDeclaration", message: "Use an `as const` object and a literal union." },
      ],
    },
  },
  {
    // The engine is pure: only the bundle loader may touch the filesystem.
    files: ["src/**/*.ts"],
    ignores: ["src/load.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "yaml"],
              message: "The engine has no runtime I/O; only src/load.ts reads the bundle.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "test/**/*.ts"],
    rules: {
      // A describe() block holds many tests; the function limit is meant for production code.
      "max-lines-per-function": "off",
    },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
