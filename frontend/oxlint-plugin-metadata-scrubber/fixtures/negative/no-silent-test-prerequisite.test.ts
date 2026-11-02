import { test } from "vitest";

test.each([false])("returns from a parameterized test", () => {
  const ready = false;
  if (!ready) return;
});

test("returns for a missing value", () => {
  const value: string | undefined = undefined;
  if (value === undefined) {
    return;
  }
});
