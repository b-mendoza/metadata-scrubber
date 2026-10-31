import { ok, Result, ResultAsync } from "neverthrow";
import { strictEqual as localOk } from "node:assert";

const load = () => Promise.resolve("value");
const mapFailure = (cause: unknown) => new Error(String(cause));

const responseResult = await ResultAsync.fromPromise(load(), mapFailure);
if (responseResult.isErr()) {
  throw responseResult.error;
}
export const value = responseResult.value;
export const returnResult = () => ok("value");

Result.fromThrowable(() => "value", mapFailure);
ResultAsync.fromThrowable(load, mapFailure);
ok("value").isErr();
ok("value").match(
  (item) => item,
  () => "fallback",
);
void ResultAsync.fromSafePromise(load()).then((result) => result.isErr());
localOk("value", "value");

export const shadowed = (ok: (item: string) => string) => {
  ok("local");
};
