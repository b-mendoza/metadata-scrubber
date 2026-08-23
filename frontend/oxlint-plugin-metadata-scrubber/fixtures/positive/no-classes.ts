import { Data as D } from "effect";

export const createService = () => ({ run: () => true });

export class TaggedFailure extends D.TaggedError("TaggedFailure")<{
  readonly reason: string;
}> {}
