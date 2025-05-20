/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      setupFiles: ["src/test-setup.ts"],
      include: ["**/*.spec.ts"],
      reporters: ["default"],
      browser: {
        enabled: true,
        headless: false, // set to true in CI
        provider: "playwright",
        instances: [{ browser: "chromium" }],
      },
    },
    define: {
      "import.meta.vitest": mode !== "production",
    },
  };
});
