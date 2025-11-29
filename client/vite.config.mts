import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import angular from "@analogjs/vite-plugin-angular";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig(({ mode }) => {
  return {
    plugins: [angular(), tsconfigPaths()],
    test: {
      globals: true,
      setupFiles: ["src/test-setup.ts"],
      include: ["**/*.spec.ts"],
      reporters: ["default"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
      },
    },
    define: {
      "import.meta.vitest": mode !== "production",
    },
  };
});
