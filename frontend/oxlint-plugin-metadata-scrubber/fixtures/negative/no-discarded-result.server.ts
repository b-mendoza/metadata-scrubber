import {
  ok,
  ok as success,
  okAsync,
  Result,
  ResultAsync,
  ResultAsync as AsyncResult,
  safeTry,
} from "neverthrow";
import * as results from "neverthrow";

const load = () => Promise.resolve("value");
const read = () => "value";
const mapFailure = (cause: unknown) => new Error(String(cause));

ResultAsync.fromPromise(load(), mapFailure);
ResultAsync.fromSafePromise(load());
Result.fromThrowable(read, mapFailure)();
ResultAsync.fromThrowable(load, mapFailure)();
ok("value");
safeTry(function* () {
  return ok("value");
});
Result.combine([ok("value")]);
await AsyncResult.fromPromise(load(), mapFailure);
void success("value").map(read).mapErr(mapFailure);
results.ok("value");
await results.ResultAsync.combine([okAsync("value")]);
