import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTableElement: "readonly",
        HTMLTableSectionElement: "readonly",
        HTMLTableRowElement: "readonly",
        HTMLTableCellElement: "readonly",
        HTMLLabelElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLDivElement: "readonly",
        Location: "readonly",
        Intl: "readonly",
        BodyInit: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
