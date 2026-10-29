import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
      },
    ],
  ],
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
});
