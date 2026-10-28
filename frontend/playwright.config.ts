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
    // eslint-disable-next-line metadata-scrubber/no-hardcoded-backend-host -- End-to-end tests use the frontend port published by Docker Compose.
    baseURL: "http://localhost:3000",
  },
});
