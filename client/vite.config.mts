import angular from "@analogjs/vite-plugin-angular";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig as testConfig } from "vitest/config";

const config = defineConfig({
  plugins: [angular(), tsconfigPaths()],
});

const tstConfig = testConfig({
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
});

export default {
  ...config,
  ...tstConfig,
};
