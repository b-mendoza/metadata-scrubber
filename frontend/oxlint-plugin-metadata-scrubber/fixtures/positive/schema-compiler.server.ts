import { Schema, Schema as S } from "effect";

const decodeAliasedValue = S.decodeUnknownSync(S.String);
const decodeValue = Schema.decodeUnknownSync(Schema.String);

export const parse = (input: unknown) => decodeValue(input);
export const parseWithAliasedSchema = (input: unknown) =>
  decodeAliasedValue(input);

export const assertString = (input: unknown) => {
  Schema.asserts(Schema.String, input);
  return input;
};

export const makeStringTransformation = () =>
  Schema.String.pipe(Schema.decodeTo(Schema.String));

export const parseWithLocalSchemaShadow = (input: string) => {
  const Schema = {
    decodeUnknownSync: () => (value: string) => value,
  };
  return Schema.decodeUnknownSync()(input);
};
