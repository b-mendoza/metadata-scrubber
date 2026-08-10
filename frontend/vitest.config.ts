import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
    environment: "happy-dom",
    include: ["./src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    setupFiles: ["./src/tests/setup-test-env.ts"],
  },
});
