import { Schema } from "effect";

export const parse = (input: unknown) =>
  Schema.decodeUnknownSync(Schema.String)(input);

export const parseWithLocalCompiler = (input: unknown) => {
  const decodeValue = Schema.decodeUnknownSync(Schema.String);
  return decodeValue(input);
};
