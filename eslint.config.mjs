import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  {
    ignores: [
      ".next/",
      ".next-cutover/",
      ".agent-worktrees/",
      "node_modules/",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      "@next/next/no-img-element": "off",
      // React Compiler rules that arrived with eslint-plugin-react-hooks 7 via
      // eslint-config-next 16. They flag ~40 existing sites (setState inside
      // effects, ref reads during render, components defined inline). Off
      // until that refactor lands; re-enable one rule at a time.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
