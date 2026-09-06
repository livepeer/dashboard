import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next.js requires `jsx: preserve`, while Vitest's import analysis needs
  // TSX lowered before it parses modules.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: [
      "components/livepeer-ui/**/*.test.tsx",
      "lib/analytics*.test.ts",
      "lib/db/**/*.test.ts",
      "lib/email/**/*.test.ts",
      "lib/env.test.ts",
      "lib/identity/**/*.test.ts",
      "lib/authentication/**/*.test.ts",
      "lib/external-accounts/**/*.test.ts",
      "lib/access/**/*.test.ts",
      "lib/admin/**/*.test.ts",
      "lib/subscriptions/**/*.test.ts",
      "lib/platform/**/*.test.ts",
      "tests/contracts/**/*.test.ts",
      "tests/contracts/**/*.test.tsx",
      "tests/support/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "lib/waitlist/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
