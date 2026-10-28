import { expect, test } from "@playwright/test";

test("shows the home page and backend health status", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Home");
  await expect(
    page.getByRole("heading", { name: "Hello, world!", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("reachable", { exact: true })).toBeVisible();
});
