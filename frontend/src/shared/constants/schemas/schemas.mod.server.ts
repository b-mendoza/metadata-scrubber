import * as z from "zod";

interface CreateURLSchemaParams extends z.core.$ZodURLParams {
  /** @default /^https$/ */
  protocol?: RegExp;
}

export const createURLSchema = (params?: CreateURLSchemaParams) => {
  const { protocol = /^https$/, ...restOfParams } = params ?? {};

  return z.url({
    protocol,
    ...restOfParams,
  });
};
