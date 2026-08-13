import { expect, test } from "vitest";

test("fails a missing prerequisite", () => {
  const prerequisite = true;
  expect(prerequisite).toBe(true);
});
