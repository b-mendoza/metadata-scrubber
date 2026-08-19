import { Schema, Schema as S } from "effect";

export const parse = (input: unknown) =>
  Schema.decodeUnknownSync(Schema.String)(input);

export const parseWithLocalCompiler = (input: unknown) => {
  const decodeValue = Schema.decodeUnknownSync(Schema.String);
  return decodeValue(input);
};

export const parseWithAliasedSchema = (input: unknown) =>
  S.decodeUnknownSync(S.String)(input);
