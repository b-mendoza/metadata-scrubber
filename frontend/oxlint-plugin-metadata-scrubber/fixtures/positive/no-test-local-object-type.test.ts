import type { ZodString as Inputs } from "zod";
import type * as contracts from "zod";

export type CreateUpload = (input: contracts.output<Inputs>) => void;
export type Upload = contracts.output<Inputs>;
export type Results = { storageKey: string }[];
export function check<Inputs>(input: Inputs) {
  return input;
}
