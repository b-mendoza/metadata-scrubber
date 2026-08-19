import { expectTypeOf, expectTypeOf as assertType, test } from "vitest";

test("re-tests a static type", () => {
  expectTypeOf("value").toEqualTypeOf<string>();
});

test("re-tests a static type through an alias", () => {
  assertType("value").toEqualTypeOf<string>();
});
