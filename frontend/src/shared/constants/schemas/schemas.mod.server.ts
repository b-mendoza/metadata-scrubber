import * as z from "zod";

const SECURE_HTTP_PROTOCOL = /^https$/;

export const createURLSchema = (
  /** @default /^https$/ */
  protocol = SECURE_HTTP_PROTOCOL,
) => {
  return z.url({
    error: `The URL value must be an absolute URL with a protocol that matches ${protocol}. Provide an explicit matching protocol and a valid host.`,
  });
};
