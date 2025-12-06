import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.NG_APP_API_BASE_URL": JSON.stringify("http://localhost:3000"),
    "import.meta.env.NG_APP_FIREBASE_API_KEY": JSON.stringify(""),
    "import.meta.env.NG_APP_FIREBASE_AUTH_DOMAIN": JSON.stringify(""),
    "import.meta.env.NG_APP_FIREBASE_PROJECT_ID": JSON.stringify(""),
    "import.meta.env.NG_APP_FIREBASE_STORAGE_BUCKET": JSON.stringify(""),
    "import.meta.env.NG_APP_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(""),
    "import.meta.env.NG_APP_FIREBASE_APP_ID": JSON.stringify(""),
    "import.meta.env.NODE_ENV": JSON.stringify("test"),
  },
  test: {
    name: "client",
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
});
