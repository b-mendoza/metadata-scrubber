import { test, test as check } from "vitest";

test.skip("skips a prerequisite", () => {});
test.skip("disabled without a callback");
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

test("returns when blocked", () => {
  const blocked = true;
  if (blocked) return;
});

test("returns after preparing when blocked", () => {
  const blocked = true;
  const prepare = (): boolean => blocked;
  if ((prepare(), blocked)) return;
});
