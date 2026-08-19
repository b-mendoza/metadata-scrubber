import { Data as D, Schema } from "effect";

export const createService = () => ({ run: () => true });

export class TaggedFailure extends D.TaggedError("TaggedFailure")<{
  readonly reason: string;
}> {}

export class SchemaRecord extends Schema.Class<SchemaRecord>("SchemaRecord")({
  value: Schema.String,
}) {}
