import { test } from "vitest";

test.skip("skips a prerequisite", () => {});

test("returns for a missing prerequisite", () => {
  const prerequisite = false;
  if (!prerequisite) {
    return;
  }
});
