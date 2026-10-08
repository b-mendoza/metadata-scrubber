import { test, test as check } from "vitest";

check.skip("skips through an imported alias", () => {});
describe.skip("skips a global suite", () => {});
it.skip("skips a global test", () => {});
test.skip.each([false])("skips parameterized tests", () => {});

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
