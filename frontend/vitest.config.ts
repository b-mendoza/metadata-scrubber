import { configDefaults, defineConfig } from "vitest/config";

const config = defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      provider: "istanbul",
    },
    projects: [
      {
        test: {
          environment: "node",
          include: ["./src/**/*.server.test.ts"],
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

export default config;
