import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    transformer: "lightningcss",
  },
  plugins: [react()],
  test: {
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      provider: "istanbul",
    },
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          include: ["./src/**/*.server.test.ts", "./scripts/**/*.test.ts"],
          name: "server",
        },
      },
      {
        extends: true,
        test: {
          environment: "happy-dom",
          exclude: [...configDefaults.exclude, "./src/**/*.server.test.ts"],
          include: ["./src/**/*.test.{ts,tsx}"],
          name: "client",
          setupFiles: ["./src/tests/setup-test-environment.ts"],
        },
      },
    ],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
