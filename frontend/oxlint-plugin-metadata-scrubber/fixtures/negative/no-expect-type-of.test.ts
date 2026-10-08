import { expectTypeOf as assertType, test } from "vitest";

test("re-tests a static type through an alias", () => {
  assertType("value").toEqualTypeOf<string>();
});

expectTypeOf("value").toEqualTypeOf<string>();
