import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import angular from "@analogjs/vite-plugin-angular";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    reporters: ["verbose"],
    testTimeout: 10000,
    projects: [
      {
        plugins: [angular(), tsconfigPaths()],
        test: {
          name: "client",
          root: "./client",
          globals: true,
          setupFiles: ["src/test-setup.ts"],
          include: ["src/**/*.spec.ts"],
          exclude: ["node_modules/**", "dist/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
        define: {
          "import.meta.vitest": false,
        },
        esbuild: {
          target: "es2022",
          tsconfigRaw: {
            compilerOptions: {
              experimentalDecorators: true,
              useDefineForClassFields: false,
              verbatimModuleSyntax: false,
            },
          },
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "server-core",
          root: "./server/core",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
          environment: "node",
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "server-functions",
          root: "./server/functions",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
          environment: "node",
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "mutation-api",
          root: "./server/mutation-api",
          include: ["src/**/*.test.ts"],
          exclude: ["node_modules/**", "dist/**"],
          environment: "node",
          setupFiles: ["src/test-setup.ts"],
        },
      },
    ],
  },
});
