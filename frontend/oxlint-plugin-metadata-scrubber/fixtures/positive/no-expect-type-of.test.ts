import { strictEqual as expectTypeOf } from "node:assert";

import { expect, test } from "vitest";

test("allows a non-Vitest function with the same name", () => {
  expectTypeOf("value", "value");
});

test("allows a parameter with the same name", () => {
  const callLocalExpectation = (
    expectTypeOf: (value: unknown) => unknown,
  ): unknown => expectTypeOf("value");

  expect(callLocalExpectation((value) => value)).toBe("value");
});

{
  const expectTypeOf = (value: unknown): unknown => value;
  expectTypeOf("local");
}
