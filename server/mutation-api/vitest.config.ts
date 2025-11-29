import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Explicitly list all tsconfig files needed for path resolution
  // since mutation-api imports from server/core which uses @common/ paths
  plugins: [
    tsconfigPaths({
      projects: ["tsconfig.json", "../core/tsconfig.json", "../../common/tsconfig.json"],
      // biome-ignore lint/suspicious/noExplicitAny: plugin compatibility
    }) as any,
  ],
  test: {
    name: "mutation-api",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["src/test-setup.ts"],
    // Enable test isolation to prevent vi.mock pollution between files
    isolate: true,
  },
});
