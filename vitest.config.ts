import angular from "@analogjs/vite-plugin-angular";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    reporters: ["verbose"],
    testTimeout: 10000,
    projects: [
      {
        // biome-ignore lint/suspicious/noExplicitAny: plugin compatibility
        plugins: [angular() as any, tsconfigPaths() as any],
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
            provider: "playwright",
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
        // biome-ignore lint/suspicious/noExplicitAny: plugin compatibility
        plugins: [tsconfigPaths() as any],
        test: {
          name: "server-core",
          root: "./server/core",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
          environment: "node",
        },
      },
      {
        // biome-ignore lint/suspicious/noExplicitAny: plugin compatibility
        plugins: [tsconfigPaths() as any],
        test: {
          name: "server-functions",
          root: "./server/functions",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
          environment: "node",
        },
      },
      {
        // biome-ignore lint/suspicious/noExplicitAny: plugin compatibility
        plugins: [tsconfigPaths() as any],
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
