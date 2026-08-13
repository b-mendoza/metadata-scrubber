import { Schema } from "effect";

const decodeValue = Schema.decodeUnknownSync(Schema.String);

export const parse = (input: unknown) => decodeValue(input);
