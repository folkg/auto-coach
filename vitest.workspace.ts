import { resolve } from "node:path";
import angular from "@analogjs/vite-plugin-angular";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Client Angular tests with browser testing
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
    resolve: {
      alias: {
        "@common": resolve(__dirname, "common/src"),
        "@server/api": resolve(__dirname, "server/api"),
      },
    },
    optimizeDeps: {
      include: [
        "@analogjs/vitest-angular/setup-snapshots",
        "@angular/compiler",
        "@testing-library/jest-dom/vitest",
        "@angular/core",
        "@angular/core/testing",
        "@angular/platform-browser/animations",
        "@angular/platform-browser-dynamic/testing",
        "@firebase/auth",
        "@firebase/firestore",
        "@firebase/functions",
        "@angular/material/dialog",
        "@testing-library/angular",
        "@angular/material/card",
        "spacetime",
        "@angular/cdk/overlay",
        "@angular/common",
        "@angular/core/rxjs-interop",
        "@angular/material/button",
        "@angular/router",
        "arktype",
        "@angular/forms",
        "@angular/material/divider",
        "@angular/material/icon",
        "@angular/material/slide-toggle",
        "@angular/material/tooltip",
        "@angular/material/form-field",
        "@angular/material/input",
        "@angular/cdk/text-field",
        "@angular/material/chips",
        "@angular/cdk/layout",
        "hono/client",
        "@angular/cdk/scrolling",
        "@angular/material/list",
        "@angular/material/sidenav",
        "@angular/material/toolbar",
        "@angular/material/checkbox",
      ],
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
  // Server core tests
  {
    plugins: [tsconfigPaths()],
    test: {
      name: "server-core",
      root: "./server/core",
      setupFiles: ["dotenv/config"],
      include: ["src/**/*.{test,spec}.ts"],
      exclude: ["node_modules/**", "dist/**", "lib/**"],
    },
    resolve: {
      alias: {
        "@common": resolve(__dirname, "common/src"),
      },
    },
  },
  // Server functions tests (for future use)
  {
    plugins: [tsconfigPaths()],
    test: {
      name: "server-functions",
      root: "./server/functions",
      setupFiles: ["dotenv/config"],
      include: ["src/**/*.{test,spec}.ts"],
      exclude: ["node_modules/**", "dist/**", "lib/**"],
    },
    resolve: {
      alias: {
        "@common": resolve(__dirname, "common/src"),
      },
    },
  },
]);
