import { expect, test } from "vitest";

test("uses a runtime assertion", () => {
  const value = "value";
  expect(value).toBe("value");
});
