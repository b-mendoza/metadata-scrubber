import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      provider: "istanbul",
    },
    projects: [
      {
        test: {
          environment: "node",
          include: ["./src/**/*.server.test.ts", "./scripts/**/*.test.ts"],
          name: "server",
        },
      },
      {
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
