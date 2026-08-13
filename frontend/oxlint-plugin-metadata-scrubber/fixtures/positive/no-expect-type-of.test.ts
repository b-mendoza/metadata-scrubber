import { expect, test } from "vitest";

test("uses a runtime assertion", () => {
  const value: string = "value";
  expect(value).toBe("value");
});
