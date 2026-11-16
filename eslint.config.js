// ESLint 9 flat config. Same rules as the old .eslintrc.json, which ESLint 9 no longer reads.
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default [
  { ignores: ["dist/"] },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  prettier,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      semi: ["error", "always"],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
