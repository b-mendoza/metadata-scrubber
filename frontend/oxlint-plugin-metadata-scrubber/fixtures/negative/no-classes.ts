import { Schema } from "effect";

export class Service {
  run() {
    return true;
  }
}

export const ServiceExpression = class {
  run() {
    return true;
  }
};

const Data = {
  TaggedError: () => Object,
};

export class LocalTaggedFailure extends Data.TaggedError() {}

export class SchemaRecord extends Schema.Class<SchemaRecord>("SchemaRecord")({
  value: Schema.String,
}) {}
