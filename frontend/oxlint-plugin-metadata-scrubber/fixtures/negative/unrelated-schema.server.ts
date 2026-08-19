import { Schema } from "effect";

export const parse = (input: unknown) =>
  Schema.decodeUnknownSync(Schema.String)(input);
