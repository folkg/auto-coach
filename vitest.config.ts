import angular from "@analogjs/vite-plugin-angular";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
        plugins: [tsconfigPaths()],
        test: {
          name: "server-core",
          root: "./server/core",
          setupFiles: ["dotenv/config"],
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "server-functions",
          root: "./server/functions",
          setupFiles: ["dotenv/config"],
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["node_modules/**", "dist/**", "lib/**"],
        },
      },
    ],
  },
});
